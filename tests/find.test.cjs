const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const find = fs.existsSync(require('node:path').resolve('src/find.js')) ? require('../src/find.js') : {};

// Only doubles the unavailable Obsidian Editor boundary; matching uses production code.
function editorFixture(initial, nativeQuery = '体', selection = [0,0]) {
  let text = initial;
  const writes = [];
  function offsetToPos(offset) {
    const lines = text.slice(0,offset).split('\n');
    return {line:lines.length-1,ch:lines[lines.length-1].length};
  }
  function posToOffset(pos) { return text.split('\n').slice(0,pos.line).reduce((n,l)=>n+l.length+1,0)+pos.ch; }
  const editor = {getValue:()=>text, offsetToPos, posToOffset,
    getCursor:side=>offsetToPos(selection[side==='from'?0:1]),
  };
  const nativeCursor = {
    current:()=>null, findNext:()=>null, findPrevious:()=>null,
    getIndexAndCount:()=>[0,0],
    findAll:()=>{
      const rows = [];
      if (!nativeQuery) return rows;
      for(let p=0;(p=text.indexOf(nativeQuery,p))>=0;p+=nativeQuery.length)
        rows.push({from:offsetToPos(p),to:offsetToPos(p+nativeQuery.length)});
      return rows;
    },
    replace:(...args)=>writes.push(args), replaceAll:(...args)=>writes.push(args),
  };
  return {editor,nativeCursor,writes,setText:value=>{text=value;selection=[0,0];}};
}

test('Find adapter covers bound input events, exits enhancement for replace, and restores owned methods', () => {
  assert.equal(typeof find.installFind,'function');
  const f = editorFixture('體 体 體');
  const input = new EventTarget(); input.value = '体'; input.toggleClass = () => {};
  const search = {
    editor:f.editor, searchInputEl:input, isActive:true, isReplace:false, cursor:null,
    getQuery(){return input.value;}, highlight(){}, clear(){}, requestUpdateCount(){},
    onSearchInput(){this.cursor=f.nativeCursor; return 'native-return';},
    findNext(){return this.cursor.findNext();},
    replaceAll(){this.cursor.replaceAll('X','searchReplace');},
    replaceCurrentMatch(){this.cursor.replace('X','searchReplace');},
    findNextOrReplace(){this.findNext();},
    show(replace=false){this.isReplace=replace; this.onSearchInput();},
  };
  const original = search.onSearchInput;
  input.addEventListener('input',original.bind(search));
  const mode = {search,showSearch(replace){search.show(replace);}};
  const view = {getViewType:()=> 'markdown',editMode:mode};
  const callbacks = new Map(), logs = [];
  const plugin = {
    active:true, settings:{fullCompatibility:false},
    expander:require('../src/matcher.js').createExpander(require('../data/character-data.json')),
    app:{workspace:{getLeavesOfType:type=>type==='markdown'?[{view}]:[],
      on(name,callback){callbacks.set(name,callback);return {name};},
    }},registerEvent(){},
  };
  const dispose = find.installFind(plugin,(event,details)=>logs.push({event,...details}));
  input.dispatchEvent(new Event('input'));
  assert.equal(search.cursor.findAll().length,3, 'Already bound native input callback must still be enhanced');
  const enhanced = search.cursor;
  search.show(true);
  assert.equal(search.cursor,f.nativeCursor);
  search.replaceAll(); assert.equal(f.writes.length,1);
  assert.throws(()=>enhanced.replaceAll('X'),/read-only/);
  search.show(false);
  assert.equal(search.onSearchInput(),'native-return');
  assert.equal(search.cursor.findAll().length,3);
  dispose(); dispose();
  assert.equal(search.onSearchInput,original);
  input.dispatchEvent(new Event('input')); assert.equal(search.cursor,f.nativeCursor);
  callbacks.get('layout-change')?.(); assert.equal(search.onSearchInput,original);
  assert(!JSON.stringify(logs).includes('體'));
});

test('Reading Find retained by a foreign hook becomes fully native after disposal', () => {
  let query='体',updates=0;
  const section={el:{ownerDocument:{createTreeWalker(){let read=false;return {nextNode(){if(read)return null;read=true;return {textContent:'體'};}};}}}};
  const renderer={lastText:'體',sections:[section],queueRender(){}};
  const search={renderer,lastQuery:null,searchInputEl:{toggleClass(){}},
    getQuery:()=>query,selectRange(){},updateCount(){},
    updateQuery(){if(this.lastQuery===query)return;this.lastQuery=query;updates++;this.highlightRanges=[];section.highlightRanges=null;},
    onSearchInput(){this.updateQuery();},
  };
  const view={getViewType:()=> 'markdown',previewMode:{search,showSearch(){}}};
  const plugin={active:true,settings:{fullCompatibility:false},registerEvent(){},
    expander:require('../src/matcher.js').createExpander(require('../data/character-data.json')),
    app:{workspace:{getLeavesOfType:()=>[{view}],on(){return {};}}}};
  const dispose=find.installFind(plugin,()=>{});
  assert.equal(search.highlightRanges.length,1);
  const wrapped=search.updateQuery;
  const foreign=function(...args){return wrapped.apply(this,args);};
  search.updateQuery=foreign;
  dispose(); assert.equal(search.updateQuery,foreign);
  const before=updates; query='next';
  search.updateQuery(); search.updateQuery();
  assert.equal(updates,before+1,'A retained wrapper must not invalidate the native render cache after disposal');
});

test('Find keeps native compatibility hits and adds sorted distinct original ranges', () => {
  assert.equal(typeof find.collectMatches,'function');
  assert.deepEqual(find.collectMatches('體 体 體','(?:体|體)',[[2,3]]),[[0,1],[2,3],[4,5]]);
  assert.deepEqual(find.collectMatches('① 1','1',[[0,1],[2,3]]),[[0,1],[2,3]]);
  assert.deepEqual(find.collectMatches('前𠀀后','(?:𠀀|一)',[]),[[1,3]]);
  assert.deepEqual(find.collectMatches('㍿ 株式会社','(?:㍿|株式会社)',[]),[[0,1],[2,6]]);
  assert.throws(()=>find.collectMatches('abc','a*',[]), /empty|zero/i);
  assert.throws(()=>find.collectMatches('abc','a',[[0,7]]));
});
test('Find cursor navigates in both directions and cannot perform replacements', () => {
  assert.equal(typeof find.createFindCursor,'function');
  const f = editorFixture('體 体 體');
  const cursor = find.createFindCursor(f.editor,f.nativeCursor,'(?:体|體)');
  assert.equal(cursor.current(),null);
  assert.deepEqual(cursor.findNext(),{from:{line:0,ch:0},to:{line:0,ch:1}});
  assert.deepEqual(cursor.getIndexAndCount(),[1,3]);
  assert.deepEqual(cursor.findNext(),{from:{line:0,ch:2},to:{line:0,ch:3}});
  assert.deepEqual(cursor.findPrevious(),{from:{line:0,ch:0},to:{line:0,ch:1}});
  assert.deepEqual(cursor.findPrevious(),{from:{line:0,ch:4},to:{line:0,ch:5}});
  assert.deepEqual(cursor.getIndexAndCount(),[3,3]);
  assert.throws(()=>cursor.replace('X','searchReplace'),/read-only/);
  assert.throws(()=>cursor.replaceAll('X','searchReplace'),/read-only/);
  assert.deepEqual(f.writes,[]); assert.equal(f.editor.getValue(),'體 体 體');
});
test('Find cursor invalidates stale text and respects selection, UTF-16 and line offsets', () => {
  assert.equal(typeof find.createFindCursor,'function');
  const f = editorFixture('体\n前𠀀后\n體','体',[0,1]);
  const cursor = find.createFindCursor(f.editor,f.nativeCursor,'(?:体|體|𠀀)');
  assert.deepEqual(cursor.findNext(),{from:{line:1,ch:1},to:{line:1,ch:3}});
  assert.equal(cursor.findAll().length,3);
  f.setText('无\n體');
  assert.equal(cursor.current(),null);
  assert.deepEqual(cursor.findNext(),{from:{line:1,ch:0},to:{line:1,ch:1}});
  assert.deepEqual(cursor.getIndexAndCount(),[1,1]);
  f.setText('无命中');
  assert.equal(cursor.findPrevious(),null);
  assert.deepEqual(cursor.getIndexAndCount(),[0,0]);
});
test('Find previous can overlap while Find all remains nonoverlapping', () => {
  assert.equal(typeof find.createFindCursor,'function');
  const f = editorFixture('體體體','体体');
  const cursor = find.createFindCursor(f.editor,f.nativeCursor,'(?:体|體)(?:体|體)');
  assert.deepEqual(cursor.findAll(),[{from:{line:0,ch:0},to:{line:0,ch:2}}]);
  assert.deepEqual(cursor.findPrevious(),{from:{line:0,ch:1},to:{line:0,ch:3}});
  assert.deepEqual(cursor.findNext(),{from:{line:0,ch:0},to:{line:0,ch:2}});
});
