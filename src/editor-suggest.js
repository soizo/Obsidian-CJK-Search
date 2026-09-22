'use strict';
const {createMappedSearch}=require('./matcher.js');
const {watchDocuments}=require('./documents.js');

function augmentTags(query,native,pool,expander,fullCompatibility,api) {
  if (!Array.isArray(native)||!Array.isArray(pool)) throw new TypeError('suggestions-interface');
  if (query==='') return native;
  const match=createMappedSearch(query,expander,fullCompatibility,query=>{
    const score=api.prepareFuzzySearch(query.toLowerCase());
    return text=>{
      const lower=text.toLowerCase();
      // ponytail: length-changing case folds stay native; add a span map if needed.
      if(lower.length!==text.length) throw new RangeError('case-range');
      return score(lower);
    };
  });
  const rows=native.slice(),seen=new Set(native.map(row=>row.tag));
  for (const row of pool) {
    if (typeof row.tag!=='string') throw new TypeError('tag-interface');
    if (seen.has(row.tag)) continue;
    const found=match(row.tag);
    if (found) {rows.push({...row,...found});seen.add(row.tag);}
  }
  return rows.sort((a,b)=>b.score-a.score);
}

function augmentLinks(manager,query,native,expander,fullCompatibility,api) {
  if (!Array.isArray(native)||!Array.isArray(manager.fileSuggestions)) throw new TypeError('suggestions-interface');
  if (query==='') return native;
  const match=createMappedSearch(query,expander,fullCompatibility,
    manager.fileSuggestions.length<10000?api.prepareFuzzySearch:api.prepareSimpleSearch);
  const rows=native.slice(),seen=new Map();
  function key(row){return JSON.stringify([row.type,row.path,row.alias]);}
  for (const row of native) if (row.file) {
    if (!seen.has(row.file)) seen.set(row.file,new Set());
    seen.get(row.file).add(key(row));
  }
  for (const candidate of manager.fileSuggestions) {
    if (!candidate.file) continue; // Unresolved link text remains exclusively native.
    if (typeof candidate.path!=='string') throw new TypeError('path-interface');
    const row={type:candidate.alias?'alias':'file',file:candidate.file,path:candidate.path};
    if (candidate.alias) row.alias=candidate.alias;
    const keys=seen.get(row.file)||new Set();
    if (keys.has(key(row))) continue;
    let found;
    if (row.type==='alias') found=match(row.alias);
    else {
      const start=row.path.lastIndexOf('/')+1;
      found=match(row.path.slice(start),start);
      if (!found) {found=match(row.path);if(found)found.score-=1;}
    }
    if (!found) continue;
    const downranked=manager.app.metadataCache.isUserIgnored(row.file.path);
    if (downranked) found.score-=10;
    rows.push({...row,...found,downranked});keys.add(key(row));seen.set(row.file,keys);
  }
  // The original link provider sorts and handles the no-result/create row.
  return rows;
}

function installEditorSuggestions(plugin,report,api) {
  let disposed=false,current=null;
  const enabled=(record,key,context)=>!disposed&&!record.retired&&plugin.active&&!!plugin.expander&&plugin.settings[key]&&
    context?.file?.extension==='md'&&plugin.app.workspace.activeLeaf?.view?.editor===context.editor;
  function restore() {
    if (!current) return;
    current.retired=true;
    for (const {target,name,original,wrapper,own} of current.hooks) {
      try {if(target[name]===wrapper){if(own)target[name]=original;else delete target[name];}} catch { /* Retired wrappers only call native. */ }
    }
    current=null;
  }
  function attach(record,target,name,wrap) {
    const original=target[name],own=Object.prototype.hasOwnProperty.call(target,name),wrapper=wrap(original);
    target[name]=wrapper;
    if (target[name]!==wrapper) throw new Error('assignment-interface');
    record.hooks.push({target,name,original,wrapper,own});
  }
  function scan() {
    const manager=plugin.app.workspace.editorSuggest;
    if (disposed||!plugin.active||!plugin.expander||!manager) return;
    const [links,tags]=manager.suggests||[];
    if (current?.links===links&&current?.tags===tags) return;
    restore();
    try {
      // Native providers are installed before addSuggest() appends third-party ones.
      // Fail closed if that roster or its public trigger contract has changed.
      if (!links?.suggestManager||typeof links.suggestManager.getFileSuggestions!=='function'||
          typeof tags?.getSuggestions!=='function'||tags.suggestManager) throw new Error('providers-interface');
      function probe(provider,text,start) {
        const result=provider.onTrigger({line:0,ch:text.length},{getLine:()=>text},null);
        return result?.query==='x'&&result.start?.ch===start&&result.end?.ch===text.length;
      }
      if (!probe(links,'[[x',2)||!probe(tags,'#x',0)) throw new Error('triggers-interface');
      const record=current={links,tags,hooks:[],retired:false};
      attach(record,tags,'getSuggestions',original=>function(...args){
        const native=original.apply(this,args),context=args[0];
        if (this!==tags||!enabled(record,'tagsEnabled',context)||context.query==='') return native;
        try {
          const pool=original.call(this,{...context,query:''});
          const result=augmentTags(context.query,native,pool,plugin.expander,plugin.settings.fullCompatibility,api);
          if(result.length>native.length)report('expanded',{surface:'tags',added:result.length-native.length});
          return result;
        } catch(error){report('native-fallback',{surface:'tags',reason:error instanceof RangeError?'limit-or-range':'native-interface'},'warn');return native;}
      });
      const target=links.suggestManager;
      attach(record,target,'getFileSuggestions',original=>async function(...args){
        const context=links.context,native=await original.apply(this,args);
        if (this!==target||!enabled(record,'internalLinksEnabled',context)||links.context!==context||args[0]?.isCancelled?.()) return native;
        try {
          const result=augmentLinks(this,args[1],native,plugin.expander,plugin.settings.fullCompatibility,api);
          if(result.length>native.length)report('expanded',{surface:'internal-links',added:result.length-native.length});
          return result;
        } catch(error){report('native-fallback',{surface:'internal-links',reason:error instanceof RangeError?'limit-or-range':'native-interface'},'warn');return native;}
      });
      report('attached',{surface:'editor-suggestions'});
    } catch {restore();report('native-fallback',{surface:'editor-suggestions',reason:'providers-interface'},'warn');}
  }
  const stopWatching=watchDocuments(plugin,scan);
  return ()=>{if(disposed)return;disposed=true;stopWatching();restore();};
}
module.exports={augmentTags,augmentLinks,installEditorSuggestions};
