'use strict';
const {LIMITS,escapeRegex}=require('./matcher.js');
const {watchDocuments}=require('./documents.js');
const clone=(value,changes)=>Object.assign(Object.create(Object.getPrototypeOf(value)),value,changes);
const nativeOperators=new Set(['content','line','block','section','task','task-todo','task-done']);

// Clone only changed branches. Native tokens, query text and original matchers
// are never modified; a failed preparation has nothing to roll back.
function createGraphQuery(query,expander,{advanced=false,fullCompatibility=false}={},enabled=()=>true) {
  if (typeof query?.query!=='string') throw new Error('query-interface');
  if (query.query.length>LIMITS.input*2 || [...query.query].length>LIMITS.input) throw new RangeError('input-limit');
  if (!query.query || !query.matcher) return query;
  const plain=advanced?null:expander.expand(query.query,{fullCompatibility,caseSensitive:!!query.caseSensitive});
  if (plain?.status==='fallback') throw new RangeError(plain.reason);
  if (plain && plain.status!=='expanded') return query;
  let visited=0,branches=0,length=0;
  const seen=new Set();
  function expand(text,caseSensitive) {
    const result=expander.expandLiteral(text,{fullCompatibility,caseSensitive});
    branches+=result.nodes;
    if (result.status==='fallback' || branches>LIMITS.branches) throw new RangeError('expansion-limit');
    return result.status==='expanded'?result.source:null;
  }
  function pattern(node,key,source) {
    if (!source) return node;
    if (typeof node[key]!=='string') throw new Error('pattern-interface');
    const next=`(?:${node[key]}|${source})`;
    length+=next.length;
    if (length>LIMITS.pattern) throw new RangeError('pattern-limit');
    new RegExp(next); // Validate before anything becomes visible to the queue.
    return clone(node,{[key]:next});
  }
  function visit(node,field='',caseSensitive=!!query.caseSensitive) {
    if (!node || typeof node.match!=='function' || !Array.isArray(node.matchedTokens)) throw new Error('matcher-interface');
    if (seen.has(node) || ++visited>LIMITS.branches) throw new RangeError('tree-limit');
    seen.add(node);
    const tokens=node.matchedTokens;
    // Property predicates and non-text comparisons retain their native subtree.
    if (tokens.some(t=>t.type==='bracket'&&t.content==='[') ||
        tokens.some(t=>['true','false','empty'].includes(t.type)) ||
        ['greaterthan','lessthan'].includes(node.type)) return node;
    const colon=tokens.findIndex(t=>t.type==='colon');
    if (colon>=0) {
      const op=tokens[colon-1]?.content?.toLowerCase();
      if (nativeOperators.has(op)) return node;
      if (op==='match-case'||op==='ignore-case') {
        if (typeof node.caseSensitive!=='boolean') throw new Error('case-interface');
        const child=visit(node.matcher,field,node.caseSensitive);
        return child===node.matcher?node:clone(node,{matcher:child});
      }
      if (!['path','file','tag'].includes(op)) throw new Error('operator-interface');
      if (op==='tag') {
        const child=node.matcher;
        if (typeof child?.text!=='string'||!child.text.startsWith('#')) throw new Error('tag-interface');
        let changed=false;
        const parts=child.text.slice(1).split('/').map(part=>{
          const mapped=expander.canonicalize(part,{fullCompatibility});
          if (mapped.status==='fallback'||/[\/#]/.test(mapped.text)) throw new Error('tag-boundary');
          const source=expand(part,false);changed=changed||!!source;
          return source||escapeRegex(part);
        });
        const enhanced=pattern(child,'regex',changed?'#'+parts.join('/'):null);
        return enhanced===child?node:clone(node,{matcher:enhanced});
      }
      const child=visit(node.matcher,op,caseSensitive);
      return child===node.matcher?node:clone(node,{matcher:child});
    }
    if (Array.isArray(node.matchers)) {
      const children=node.matchers.map(child=>visit(child,field,caseSensitive));
      return children.every((child,i)=>child===node.matchers[i])?node:clone(node,{matchers:children});
    }
    if (node.matcher && tokens.some(t=>t.type==='not')) {
      const child=visit(node.matcher,field,caseSensitive);
      return child===node.matcher?node:clone(node,{matcher:child});
    }
    if (tokens.some(t=>t.type==='regex')) return node;
    if (tokens.some(t=>t.type==='quote')) {
      if (!['path','file'].includes(field)) return node;
      if (typeof node.text!=='string') throw new Error('text-interface');
      return pattern(node,'partialMatchRegex',expand(node.text,caseSensitive));
    }
    if (tokens.some(t=>t.type==='text')&&typeof node.text==='string')
      return pattern(node,'regex',expand(node.text,caseSensitive));
    throw new Error('unknown-matcher');
  }
  const matcher=visit(query.matcher);
  if (matcher===query.matcher) return query;
  const required=matcher.requiredInputs();
  if (!query.requiredInputs || Object.keys(required).length!==Object.keys(query.requiredInputs).length ||
      Object.keys(required).some(key=>required[key]!==query.requiredInputs[key]) || typeof query._match!=='function')
    throw new Error('required-inputs-interface');
  return clone(query,{matcher,_match(...args){return query._match.apply(enabled()?this:query,args);}});
}

function installGraph(plugin,report) {
  const records=new Map();let disposed=false;
  const enabled=()=>!disposed&&plugin.active&&plugin.settings.graphEnabled&&!!plugin.expander;
  function reset(record) {
    record.current=false;
    for (const {entry,native,enhanced} of record.queries) if (entry.query===enhanced) {
      try { entry.query=native; } catch { /* Retained enhanced queries already delegate to native. */ }
    }
    record.queries=[];
  }
  function refresh(record) {
    const e=record.engine,queries=[],value=e.filterOptions.search.getValue();
    if (value) queries.push({query:value,color:null});
    e.setQuery(queries.concat(e.colorGroupOptions.getColoredQueries()));
  }
  function restore(record,rerun) {
    record.retired=true;reset(record);
    const e=record.engine;
    if (e.setQuery===record.wrapper) {
      if (record.own) e.setQuery=record.original;else delete e.setQuery;
    }
    if (rerun) refresh(record);
  }
  function scan() {
    if (!enabled()) return;
    try {
      const live=new Map();
      if (plugin.app.internalPlugins?.getEnabledPluginById?.('graph'))
        for (const type of ['graph','localgraph']) for (const {view} of plugin.app.workspace.getLeavesOfType(type)) {
          const engine=type==='graph'?view.dataEngine:view.engine;
          if (engine && view._loaded!==false) live.set(engine,type);
        }
      for (const [engine,record] of records) if (!live.has(engine)) {records.delete(engine);restore(record,false);}
      for (const [engine,type] of live) {
        if (records.has(engine)) continue;
        try {
        if (typeof engine.setQuery!=='function'||typeof engine.filterOptions?.search?.getValue!=='function'||
            typeof engine.colorGroupOptions?.getColoredQueries!=='function') throw new Error('graph-interface');
        const record={engine,type,original:engine.setQuery,own:Object.prototype.hasOwnProperty.call(engine,'setQuery'),queries:[],retired:false,current:false};
        const wrapper=function(...args) {
          if (this!==engine) return record.original.apply(this,args);
          reset(record);
          const result=record.original.apply(this,args);
          if (record.retired||!enabled()) return result;
          if (this.searchQueries!==null && !Array.isArray(this.searchQueries)) {
            report('native-fallback',{surface:type,reason:'queries-interface'},'warn');return result;
          }
          if (!this.fileFilter || typeof this.fileFilter!=='object' || Array.isArray(this.fileFilter) || Object.keys(this.fileFilter).length) {
            report('native-fallback',{surface:type,reason:'query-timing-interface'},'warn');return result;
          }
          record.current=true;
          // Capture a generation object: old queries cannot revive on a later call.
          const generation=record.queries;
          for (const entry of this.searchQueries||[]) {
            try {
              const native=entry.query;let committed=false;
              const enhanced=createGraphQuery(native,plugin.expander,{
                advanced:plugin.settings.graphAdvancedQueries,fullCompatibility:plugin.settings.fullCompatibility,
              },()=>committed&&enabled()&&!record.retired&&record.current&&record.queries===generation);
              if (enhanced!==native) {
                entry.query=enhanced;
                if (entry.query!==enhanced) throw new Error('query-assignment');
                record.queries.push({entry,native,enhanced});committed=true;
                report('expanded',{surface:type,kind:entry.color?'group':'filter'});
              }
            } catch (error) {
              report('native-fallback',{surface:type,kind:entry.color?'group':'filter',reason:error instanceof RangeError?'query-limit':'query-interface'},'warn');
            }
          }
          return result;
        };
        record.wrapper=wrapper;engine.setQuery=wrapper;records.set(engine,record);
        report('attached',{surface:type});refresh(record);
        } catch {report('native-fallback',{surface:type,reason:'instance-interface'},'warn');}
      }
    } catch {report('native-fallback',{surface:'graph',reason:'scan-interface'},'warn');}
  }
  const stopWatching=watchDocuments(plugin,scan);
  return {
    refresh(){scan();for (const record of records.values()) {
      try {refresh(record);} catch {report('native-fallback',{surface:record.type,reason:'refresh-interface'},'warn');}
    }},
    dispose(){
      if (disposed) return;disposed=true;stopWatching();
      for (const record of records.values()) {
        try {restore(record,true);} catch {report('native-fallback',{surface:record.type,reason:'restore-interface'},'warn');}
      }
      records.clear();
    },
  };
}
module.exports={createGraphQuery,installGraph};
