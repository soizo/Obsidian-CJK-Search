'use strict';
const {createMappedSearch}=require('./matcher.js');

function augmentFolderSuggestions(modal,rawQuery,native,expander,fullCompatibility,api) {
  if(typeof rawQuery!=='string'||!Array.isArray(native)) throw new TypeError('suggestions-interface');
  const query=rawQuery.trim();
  if(!query) return native;
  const match=createMappedSearch(query,expander,fullCompatibility,api.prepareFuzzySearch);
  // The native pool owns move restrictions (notably self/descendant exclusion).
  const items=modal.getItems();
  if(!Array.isArray(items)||items.some(item=>!(item instanceof api.TFolder))) throw new TypeError('folders-interface');
  const rows=native.slice(),seen=new Set(native.map(row=>row.item));
  for(const item of items) {
    if(seen.has(item)) continue;
    const text=modal.getItemText(item);
    if(typeof text!=='string') throw new TypeError('folder-text-interface');
    const found=match(text);
    if(found) {rows.push({item,match:found});seen.add(item);}
  }
  modal.sortSuggestions(rows);
  return rows;
}

function installFolderSearch(plugin,report,api) {
  const target=api.FuzzySuggestModal?.prototype;
  let disposed=false,original,wrapper;
  const fallback=reason=>report('native-fallback',{surface:'folder-search',reason},'warn');
  try {
    if(!target||typeof target.getSuggestions!=='function'||typeof api.TAbstractFile!=='function'||typeof api.TFolder!=='function')
      throw new Error('modal-interface');
    original=target.getSuggestions;
    wrapper=function(...args) {
      const native=original.apply(this,args);
      if(disposed||!plugin.active||!plugin.expander||!plugin.settings.folderSearchEnabled||this.app!==plugin.app) return native;
      try {
        // There is no exposed active move-modal instance in 1.13.7. Scope this
        // shared hook to the direct native subclass's move contract; unrelated
        // dialogs and unknown subclasses remain entirely native.
        const prototype=Object.getPrototypeOf(this);
        if(Object.getPrototypeOf(prototype)!==target||!Array.isArray(this.files)||!this.files.length||
            !this.files.every(file=>file instanceof api.TAbstractFile)||!this.inputEl||
            this.emptyMatch?.item!==null||!Object.isFrozen(this.emptyMatch)||
            !['getItems','getItemText','onChooseItem'].every(key=>Object.prototype.hasOwnProperty.call(prototype,key)&&typeof this[key]==='function')) return native;
        const rows=augmentFolderSuggestions(this,args[0],native,plugin.expander,plugin.settings.fullCompatibility,api);
        if(rows.length>native.length) report('expanded',{surface:'folder-search',added:rows.length-native.length});
        return rows;
      } catch(error) {
        fallback(error instanceof RangeError?'limit-or-range':'native-interface');
        return native;
      }
    };
    target.getSuggestions=wrapper;
    if(target.getSuggestions!==wrapper) throw new Error('assignment-interface');
  } catch {fallback('unsupported-interface');}
  return ()=>{
    if(disposed) return;
    disposed=true;
    if(wrapper&&target.getSuggestions===wrapper) target.getSuggestions=original;
  };
}

module.exports={augmentFolderSuggestions,installFolderSearch};
