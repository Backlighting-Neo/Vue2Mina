String.prototype.replaceAll = function(reallyDo, replaceWith, ignoreCase) {
  if (!RegExp.prototype.isPrototypeOf(reallyDo)) {
    return this.replace(new RegExp(reallyDo, (ignoreCase ? "gi" : "g")), replaceWith);
  } else {
    return this.replace(reallyDo, replaceWith);
  }
}

module.exports = {
	isCssScoped: false,

	getVueTag(sourceFile, tagName) {
		var start = sourceFile.indexOf('<'+tagName+'>');
		if(start===-1){
			start = sourceFile.indexOf('<'+tagName+' scoped>') + 7;
			this.isCssScoped = true;
		}
		start += tagName.length + 2
		var end = sourceFile.indexOf('</'+tagName+'>');
		return sourceFile.substring(start, end);
	},


	
}