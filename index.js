#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const process = require('process');

const recast = require('recast');	// JS解析器
const types = require("ast-types"); // JS节点构造器
const builder = recast.types.builders; // JS节点构造器
const parseXML = require('xml-parser'); // HTML解析器
const stringifyXML = require('xml-stringify'); // HTML还原器
const prettifyXml = require('prettify-xml'); // HTML美化器
const css = require('css'); // CSS语法分析器

const config = require('./config.js'); // 配置文件
var utils = require('./utils.js');

// 配置文件检查
var configItemType = {
	htmlEventMap: Object,
	htmlDomMap: Object,
	htmlDomNeedToBeDrop: Array,
	detectedImageFile: Boolean,
	cssUnitConvertFunction: Function,
	imageURLConvertFunction: Function,
	vueLifeMethodNeedToBeDrop: Array,
	vueLifeMethodMap: Object,
	vueLifeMethodNeedToBeFlatten: Array
}
var hasConfigError = false;
Object.keys(config).forEach(item=>{
	if(!configItemType[item]){
		hasConfigError = true;
		console.error(`未知的配置项[${item}]`);
	}
	else if(config[item].constructor !== configItemType[item]) {
		hasConfigError = true;
		console.error(`配置项[${item}]有误，数据类型应为${configItemType[item].name}`);
	}
})
if(hasConfigError) process.exit();

// 运行配置
var runConfig = {
	mode: 'component', // 转化模式，组件还是页面 component/page
};

// ---读入文件---
var filePath = process.argv[process.argv.length-1] || '';
if(filePath === '' || filePath.indexOf('.vue')===-1){
	console.error('Usage: vue2mina ./component.vue');
	process.exit();
}
var vueSourceFile = fs.readFileSync(filePath, 'utf-8');

// ---拆分模块---
var htmlOriginalCode  = utils.getVueTag(vueSourceFile, 'template');
var jsOriginalCode    = utils.getVueTag(vueSourceFile, 'script');
var cssOriginalCode   = utils.getVueTag(vueSourceFile, 'style');

// ---要输出的源代码---
var htmlProcessedCode = '';
var jsProcessedCode   = '';
var cssProcessedCode  = '';

// ---参数---
var outputFileName    = path.basename(filePath).replace('.vue','');
var isCssScoped       = utils.isCssScoped;
var cssSelectorPrefix = outputFileName;

// ---源代码预处理---
htmlOriginalCode = htmlOriginalCode.replace(/(@\w*)\.\w*/g, '$1'); // 去掉Vue的事件过滤去，例如@click.stop
Object.keys(config.htmlEventMap).forEach(htmlEventName=>{
	htmlOriginalCode = htmlOriginalCode.replaceAll('@'+htmlEventName, config.htmlEventMap[htmlEventName]);
})
htmlOriginalCode = htmlOriginalCode.replace(/\<(.*?) (.*?)\/\>/g, '<$1 $2></$1>'); // 去掉自闭合的标签

// ---语法树解析---
var htmlAST = parseXML(htmlOriginalCode);
var jsAST   = recast.parse(jsOriginalCode);
var cssAST  = css.parse(cssOriginalCode);

// ---从JS文件中寻找组件依赖关系---
var componentList = []; // 组件列表
var componentListName = [];
var importMap = {}; // import映射关系
types.visit(jsAST, {
	visitImportDeclaration(path) { // 寻找全部import语句，将来支持require语句
		let node = path.node;
		if(node.specifiers.length===1) { // 若为解构类型的import语句，直接丢弃，暂不支持
			let key = node.specifiers[0].local.name;
			let value = node.source.value;
			importMap[key] = value;
		}
		return false;
	},
	visitExportDefaultDeclaration(path) { // Vue组件的导出实体
		let node = path.node;
		let componentTryArray = node.declaration.properties.filter(p=>p.key.name==='components'); // 在exportDefault语句中寻找导出的components属性
		if(componentTryArray.length===1) {
			componentListName = componentTryArray[0].value.properties.map(p=>{return p.key.name}); // 将Component映射抽出，目前只支持shorthand方式的语法
		}
		return false;
	}
})
componentList = componentListName.map(component=>{return {name: component, source: importMap[component]}});

// ---CSS文件处理---
cssAST.stylesheet.rules = cssAST.stylesheet.rules.map(rule=>{
	if(rule.type === 'comment') return(rule); // 注释的代码片段原样输出
	if(isCssScoped) // 如果Vue文件中的style片段为scope类型，则在每一个选择器前加上一个前缀以模拟scope
		rule.selectors = rule.selectors.map(selector=>{
			return selector.replace(/\.(\w*)/, `.${cssSelectorPrefix}-$1`);
		})
	rule.declarations = rule.declarations.map(e=>{ // 单位转换
		if(e.type==='comment') return(e); // 某一条规则为注释，则原样输出
		e.value = e.value.replace(/\d*(\.\d*)?rem/g, config.cssUnitConvertFunction)
		return e;
	});
	return rule;
});

// ---重建CSS代码---
cssProcessedCode = css.stringify(cssAST);

// ---CSS代码后处理--- 加入import指令
cssProcessedCode = componentList.map(com=>`@import "${com.source}.wxss";`).join('\n') + '\n\n' + cssProcessedCode;

// ---HTML单向数据绑定后需要加入JS中的绑定函数---
var vModelTransformList = [];

// ---HTML文件处理递归函数---
function transform(ast) {
	if(!config.htmlDomMap[ast.name]) { // 处理Vue中的自定义组件，变成微信小程序中的template
		ast.attributes.is = ast.name; // is属性为模板名
		ast.name = 'template'; // 模块名为template
		ast.attributes.data = `{{}}`; // 先加一个空的data属性，以后我会想办法补上的，我发誓

	}
	ast.name = config.htmlDomMap[ast.name] || ast.name; // DOM名转换

	Object.keys(ast.attributes).map(attr=>{ // 属性名和语法转换
		if(attr.startsWith(':')){ // 处理Vue中的绑定语法
			if(ast.name === 'template')
				ast.attributes.data = ast.attributes.data.replace('}}', `${attr.replace(':','')}:${ast.attributes[attr]}, }}`);
			else
				ast.attributes[attr.replace(':', '')] = `{{${ast.attributes[attr]}}}`;

			delete ast.attributes[attr];
			return;
		}

		switch(attr) {
			case 'v-if': // 处理Vue中的条件渲染
				attr = 'wx:if';
				ast.attributes[attr]=`{{${ast.attributes['v-if']}}}`;
				delete ast.attributes['v-if'];
				break;
			case 'v-for': // 处理Vue中的列表渲染
				attr = 'wx:for';
				let [forItem, forList] = ast.attributes['v-for'].split(' in ');
				let forIndex = '';
				if(forItem.includes('('))
					[, forItem, forIndex] = forItem.match(/\(\s*(\w*)\s*\,\s*(\w*)\s*\)/);
				ast.attributes[attr] = `{{${forList}}}`;
				ast.attributes['wx:for-item'] = forItem;
				if(forIndex !== '')
					ast.attributes['wx:for-index'] = forIndex;
				delete ast.attributes['v-for'];
				break;
			case 'v-model': // 处理Vue中的双向数据绑定
				if(ast.name === 'input') {
					attr = 'bindinput';
					ast.attributes[attr]=`changeModel_${ast.attributes['v-model']}`;
				}
				else if(ast.name === 'textarea') {
					attr = 'bindblur';
					ast.attributes[attr]=`changeModel_${ast.attributes['v-model']}`;
				}

				if(vModelTransformList.indexOf(ast.attributes['v-model']) === -1)
					vModelTransformList.push(ast.attributes['v-model']);
				delete ast.attributes['v-model'];
				break;
			case 'class': // CSS类处理
				ast.attributes[attr] = (cssSelectorPrefix+'_'+ast.attributes[attr]);
				break;
			case 'src': // 图片URL处理
				if(config.detectedImageFile && !ast.attributes.src.includes('http'))
					ast.attributes.src = config.imageURLConvertFunction(ast.attributes.src);
				break;
			default: 
				if(ast.name === 'template' && 'is,data'.indexOf(attr)===-1) {
					ast.attributes.data = ast.attributes.data.replace('}}', `${attr}:${ast.attributes[attr]}, }}`);
					delete ast.attributes[attr];
					attr = undefined;
				}
				break;
		}

		if(attr && ast.attributes[attr] && ast.attributes[attr].includes('|'))// 处理Vue中的Filter
			ast.attributes[attr] = ast.attributes[attr].replace(/{{(.*?)\|(.*?)}}/g, '{{$2($1)}}');
	})

	if(ast.attributes.data) ast.attributes.data = ast.attributes.data.replace(', }}','}}');

	if(ast.content) // 处理Vue中Content中的Filter
		ast.content = ast.content.replace(/{{(.*?)\|(.*?)}}/g, '{{$2($1)}}');

	if(ast.children && ast.children.length>0) // 继续迭代子元素
		ast.children = ast.children.filter(dom => config.htmlDomNeedToBeDrop.indexOf(dom.name)===-1).map(childrenAST => transform(childrenAST));
	return ast;
}

// ---HTML文件处理---
htmlAST.root = transform(htmlAST.root);

// ---HTML包裹一层template组件---
if(runConfig.mode === 'component')
	htmlAST.root = {
		name: 'template',
		attributes: {
			name: outputFileName
		},
		content: '',
		children: [htmlAST.root]
	}

// ---HTML文件重建---
htmlProcessedCode = prettifyXml(stringifyXML(htmlAST));

// ---HTML代码后处理---  加入由于模板依赖所需要的import指令
htmlProcessedCode = componentList.map(com=>`<import src="${com.source}" />`).join('\n') + '\n\n' + htmlProcessedCode;

// ---JS代码处理---
types.visit(jsAST, {
	visitAssignmentExpression(path) { // 赋值语句
		let node = path.node;

		console.log(node);
		// 对this的赋值转变为对this中setData的调用
		if(node.left.type==='MemberExpression' && node.left.object.type === 'ThisExpression') {
			path.replace(builder.callExpression(
				builder.memberExpression(
					builder.thisExpression(),
					builder.identifier('setData')
				),
				[builder.objectExpression([builder.property('init',builder.identifier(node.left.property.name),node.right)]
				)]
			));
		}

		return false;
	},

	visitMemberExpression(path) { // 成员语句
		let node = path.node;

		// Vue中的this.identifier转换为this.data.identifier
		if(path.parentPath.node.type === 'AssignmentExpression' && node.object.type === 'ThisExpression' && node.property.type === 'Identifier')
			node.object = builder.memberExpression(builder.thisExpression(),builder.identifier('data'));

		return false;
	},

	visitCallExpression(path) { // 调用语句
		let node = path.node;

		// alert转换为wx.showModal
		if(node.callee.type === 'Identifier' && node.callee.name === 'alert') {
			node.callee = builder.memberExpression(builder.identifier('wx'), builder.identifier('showModal'));
			var alertArgument = node.arguments[0];
			node.arguments = [builder.objectExpression([
				builder.property('init',builder.identifier('title'), builder.literal('提示')),
				builder.property('init',builder.identifier('content'), alertArgument),
				builder.property('init',builder.identifier('showCancel'), builder.literal(false))
			])]
		}
		return false;
	},

	visitImportDeclaration(path) { // 引用语句
		let node = path.node;

		// 删除组件引用语句
		if(componentListName.indexOf(node.specifiers[0].local.name)>-1)
			path.prune();

		return false;
	},

	visitExportDefaultDeclaration(path) { // 导出语句
		let node = path.node;
		let objectDeclaration;

		// 处理各种生命周期
		let astDeclaration = node.declaration;

		let hasOnPullDownRefresh = false,  // 是否含有下拉刷新事件
				hasOnReachBottom = false, // 是否含有底部刷新事件
				methodToBeConcat = [];  // 需要展平的方法列表

		astDeclaration.properties = astDeclaration.properties.map(property=>{
			var propKey = property.key.name;

			if(propKey === 'created') {
				property.key.name = 'onLoad';
				property.value.params.push(builder.identifier('params'));
			}
			else if(propKey === 'beforeDestroy') {
				property.key.name = 'onUnload';
			}
			else if(propKey === 'onPullDownRefresh')
				hasOnPullDownRefresh = true;
			else if(propKey === 'onReachBottom')
				hasOnReachBottom = true;
			else if(propKey === 'data' && property.value.type === 'FunctionExpression')
				property = builder.property('init', builder.identifier('data'), property.value.body.body[0].argument)
			else if(propKey === 'computed')
				methodToBeConcat = methodToBeConcat.concat(property.value.properties);
			else if(propKey === 'methods')
				methodToBeConcat = methodToBeConcat.concat(property.value.properties);
			else if(propKey === 'filters')
				methodToBeConcat = methodToBeConcat.concat(property.value.properties);

			return property;
		});

		const propertyNeedToBeDelete = ['methods', 'computed', 'components', 'filters']; // 需要删除的顶级属性
		astDeclaration.properties = astDeclaration.properties.concat(methodToBeConcat)
			.filter(element=>propertyNeedToBeDelete.indexOf(element.key.name)===-1);

		// 转换Vue的v-model
		vModelTransformList.forEach(vModel=>{
			astDeclaration.properties.push(builder.property('init',
				builder.identifier(`changeModel_${vModel}`),
				builder.functionExpression(null,[
					builder.identifier('event')
					],
					builder.blockStatement([
						builder.expressionStatement(
							builder.callExpression(
								builder.memberExpression(
									builder.thisExpression(),
									builder.identifier('setData')
								),
								[builder.objectExpression(
									[builder.property('init',
										builder.identifier(vModel),
										builder.memberExpression(
											builder.memberExpression(
												builder.identifier('event'),
												builder.identifier('detail')
											),
											builder.identifier('value')
										)
									)]
								)]
							)
						)
					]))))
		})

		if(!hasOnReachBottom)
			astDeclaration.properties.push(builder.property('init',
				builder.identifier('onReachBottom'),
				builder.functionExpression(null,[],
					builder.blockStatement([builder.emptyStatement()]
			))))

		if(!hasOnPullDownRefresh)
			astDeclaration.properties.push(builder.property('init',
				builder.identifier('onPullDownRefresh'),
				builder.functionExpression(null,[],
					builder.blockStatement([builder.emptyStatement()]
			))))

		astDeclaration.properties = astDeclaration.properties.filter(p=>config.vueLifeMethodNeedToBeDrop.indexOf(p.key.name)===-1)

		path.replace(builder.expressionStatement(
			builder.callExpression(
				builder.identifier('Page')
			, [astDeclaration])
		))

		return false;
	}
})

// ---JS代码重建---
jsProcessedCode = recast.prettyPrint(jsAST, {tabWidth: 2}).code;

// ---JS代码后处理---
jsProcessedCode = jsProcessedCode.replace(/this\.\$router\./g, 'utils.navigator.');

// ---输出转换后的文件---
if(!fs.existsSync('./dist')) fs.mkdirSync('./dist/');
fs.writeFileSync(`./dist/${outputFileName}.wxml`, htmlProcessedCode);
fs.writeFileSync(`./dist/${outputFileName}.wxss`, cssProcessedCode);
fs.writeFileSync(`./dist/${outputFileName}.js`, jsProcessedCode);
