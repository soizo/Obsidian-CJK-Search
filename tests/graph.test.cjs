'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createExpander}=require('../src/matcher.js');
const expander=createExpander(require('../data/character-data.json'));
const {createGraphQuery,installGraph}=require('../src/graph.js');
// Small host-contract doubles; syntax and actual native classes are exercised
// in the real Obsidian graph suite, not reimplemented as a test parser.
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function literal(text) {
 return {text,regex:escape(text),matchedTokens:[{type:'text',content:text,pos:0}],
  requiredInputs(){return{content:true};},match(c){return new RegExp(this.regex,c.caseSensitive?'':'i').test(c.value)?{}:null;}};
}
function operator(name,child) {
 return {matcher:child,matchedTokens:[{type:'text',content:name,pos:0},{type:'colon',content:':',pos:name.length}],
  requiredInputs(){return this.matcher.requiredInputs();},match(c){return this.matcher.match(c);}};
}
function query(text,matcher=literal(text)) {
 return {query:text,caseSensitive:false,matcher,requiredInputs:matcher.requiredInputs(),
  _match(c){return this.matcher.match(c);},match(value){return this._match({value,caseSensitive:this.caseSensitive});}};
}
test('readonly graph instances cannot block healthy panels; retired hooks and listeners stay inactive',async()=>{
 const events=new Map(),logs=[];
 function engine(){return {searchQueries:[],fileFilter:{},value:'体',results:[],
  filterOptions:{search:{getValue(){return '体';}}},colorGroupOptions:{getColoredQueries(){return[];}},
  setQuery(values){const entries=this.searchQueries=values.map(v=>({query:query(v.query),color:v.color}));
   this.done=Promise.resolve().then(()=>{this.results=['体','體'].filter(value=>entries.every(e=>e.query.match(value)));});},
 };}
 const bad=engine(),good=engine();Object.defineProperty(bad,'setQuery',{writable:false});
 const leaves=[{view:{dataEngine:bad}},{view:{dataEngine:good}}];
 const workspace={getLeavesOfType:type=>type==='graph'?leaves:[],on(name,fn){events.set(fn,name);return fn;},offref(fn){events.delete(fn);}};
 const plugin={active:true,expander,settings:{graphEnabled:true,graphAdvancedQueries:false,fullCompatibility:false},
  app:{workspace,internalPlugins:{getEnabledPluginById(){return {};}}}};
 const control=installGraph(plugin,(...args)=>logs.push(args));await good.done;
 assert.deepEqual(good.results,['体','體']);const retained=good.searchQueries[0].query;
 const installed=good.setQuery,foreign=function(...args){return installed.apply(this,args);};good.setQuery=foreign;
 control.dispose();await good.done;assert.equal(good.setQuery,foreign);assert.equal(events.size,0);
 assert.deepEqual(good.results,['体']);assert.equal(retained.match('體'),null);
 const second=installGraph(plugin,(...args)=>logs.push(args));await good.done;
 assert.deepEqual(good.results,['体','體']);assert.equal(retained.match('體'),null);
 second.dispose();assert.equal(events.size,0);assert(logs.some(([event])=>event==='native-fallback'));
});
for(const fault of ['early-scan','throwing-setter']) test(`graph falls back entirely on ${fault}`,async()=>{
 const engine={fileFilter:{},filterOptions:{search:{getValue(){return '体';}}},colorGroupOptions:{getColoredQueries(){return[];}},
  setQuery(){
   let native=query('体');const entry={query:native,color:null};
   this.searchQueries=[entry];this.fileFilter=fault==='early-scan'?{first:native.match('体')}:{};
   if(fault==='throwing-setter')Object.defineProperty(entry,'query',{get(){return native;},set(v){native=v;throw new Error('PRIVATE');}});
   this.done=Promise.resolve().then(()=>{this.results=['体','體'].filter(value=>entry.query.match(value));});
  },
 };
 const logs=[],workspace={getLeavesOfType:type=>type==='graph'?[{view:{dataEngine:engine}}]:[],on(){return{};},offref(){}};
 const plugin={active:true,expander,settings:{graphEnabled:true},app:{workspace,internalPlugins:{getEnabledPluginById(){return{};}}}};
 const controller=installGraph(plugin,(...args)=>logs.push(args));await engine.done;
 assert.deepEqual(engine.results,['体']);assert(logs.some(([event])=>event==='native-fallback'));
 assert(!JSON.stringify(logs).includes('PRIVATE'));controller.dispose();
});
test('graph equivalents preserve original query trees and retired query references become native',()=>{
 const original=query('体');let active=true;
 Object.freeze(original.matcher);Object.freeze(original);
 const enhanced=createGraphQuery(original,expander,{fullCompatibility:true},()=>active);
 assert(enhanced.match('體'));assert.equal(original.match('體'),null);
 assert.equal(enhanced.query,'体');assert.equal(enhanced.matcher.text,'体');
 active=false;assert.equal(enhanced.match('體'),null);assert(enhanced.match('体'));
});
test('advanced conditions require opt-in and excluded operator subtrees stay native',()=>{
 const original=query('file:体',operator('file',literal('体')));
 assert.equal(createGraphQuery(original,expander,{}),original);
 assert(createGraphQuery(original,expander,{advanced:true}).match('體'));
 const content=query('content:体',operator('content',literal('体')));
 assert.equal(createGraphQuery(content,expander,{advanced:true}),content);
 const regex=literal('体');delete regex.text;regex.matchedTokens=[{type:'regex',content:'体',pos:0}];
 const requery=query('/体/',regex);assert.equal(createGraphQuery(requery,expander,{advanced:true}),requery);
});
test('case scopes survive character expansion',()=>{
 const child=literal('體A'),node=operator('match-case',child);node.caseSensitive=true;
 node.match=function(c){return this.matcher.match({...c,caseSensitive:this.caseSensitive});};
 const q=createGraphQuery(query('match-case:體A',node),expander,{advanced:true});
 assert(q.match('体A'));assert.equal(q.match('体a'),null);
});
test('tag matching preserves exact and child boundaries without flattening fullwidth separators',()=>{
 const tag=operator('tag',literal('#研究'));
 tag.match=function(c){return new RegExp('^'+this.matcher.regex+'($|/)','i').test(c.value)?{}:null;};
 const q=createGraphQuery(query('tag:研究',tag),expander,{advanced:true,fullCompatibility:true});
 assert(q.match('#硏究'));assert(q.match('#硏究/體'));
 assert.equal(q.match('#硏究者'),null);assert.equal(q.match('#硏究／體'),null);
 const nested=operator('tag',literal('#研究/体'));nested.match=tag.match;
 const nq=createGraphQuery(query('tag:研究/体',nested),expander,{advanced:true,fullCompatibility:true});
 assert(nq.match('#硏究/體'));assert.equal(nq.match('#硏究／體'),null);
});
test('graph budgets accumulate across literals rather than resetting per leaf',()=>{
 const leaves=Array.from({length:128},()=>literal('A'));
 const root={matchedTokens:[],matchers:leaves,requiredInputs(){return{content:true};},match(){return null;}};
 assert.throws(()=>createGraphQuery(query(Array(128).fill('A').join(' '),root),expander,{advanced:true,fullCompatibility:true}),/expansion-limit/);
 assert(leaves.every(node=>node.regex==='A'));
});
test('graph preparation fails whole on bounds, unknown structure or a cycle without changing native nodes',()=>{
 const original=query('体'.repeat(257));const before=original.matcher.regex;
 assert.throws(()=>createGraphQuery(original,expander,{advanced:true}),/limit/);assert.equal(original.matcher.regex,before);
 const cycle=operator('file',literal('体'));cycle.matcher=cycle;
 assert.throws(()=>createGraphQuery({...query('file:体'),matcher:cycle},expander,{advanced:true}));
 const unknown={...literal('体'),matchedTokens:[]};
 assert.throws(()=>createGraphQuery(query('体',unknown),expander,{advanced:true}));
 const both={matchedTokens:[],matchers:[literal('体'),unknown],requiredInputs(){return{content:true};},match(){return null;}};
 assert.throws(()=>createGraphQuery(query('体 体',both),expander,{advanced:true}));assert.equal(both.matchers[0].regex,'体');
});
