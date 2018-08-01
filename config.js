// Vue转小程序代码转换器配置
// 在下面的配置项中，凡配置名以Map结尾的，其中均为key为Vue中的用法，value为小程序中的用法

module.exports = {
	htmlEventMap: { // html事件对应关系
		click: 'bindtap'
	},
	htmlDomMap: { // html中DOM对应关系，
		div: 'view',
		img: 'image',
		span: 'text',
		input: 'input',
		textarea: 'textarea',
		Swiper: 'swiper',
		SwiperItem: 'swiper-item',
	},
	htmlDomNeedToBeDrop: [ // 要删除的DOM元素
		'br'
	],
	detectedImageFile: true,
	cssUnitConvertFunction: function(numberWithUnit) {
		// CSS进行单位转换时要执行的函数
		return parseInt(parseFloat(numberWithUnit.replace('rem'))*100)+'rpx';
	},
	imageURLConvertFunction: function(url) { 
		// HTML文件中Image标签要进行连接转换的函数，仅当detectedImageFile为true时生效
		// 只有本地的图片URL会被发送到这里进行处理
		return url.replace(/\.*\/assets/g, 'http://s.xiaohongchun.com/lsj');
	},
	vueLifeMethodNeedToBeDrop: [ // 要删除的Vue生命周期函数
		'beforeRouteEnter', 'beforeRouteLeave'
	],
}