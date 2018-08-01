# Vue-MINA代码转换器

---

## 更新日志

#### 2016.10.31

- 修复了CSS中有注释时崩溃的问题
- 删除Vue Template中v-model指令
- 提示上传图片的CDN时，去除重复项
- 将Vue中的Filter调整至函数调用方式实现
- v-model的双向数据绑定到单向数据绑定的转换

#### 2016.11.01

- 将未识别的HTML标签转为驼峰命名法

#### 2016.11.03

- 修复了CSS转换到WXSS时，当一条规则中出现多个数值时，只将第一个值进行了单位变换的问题  contributed by mengxue
- 修复了WXML中textarea事件绑定名称不对的问题  contributed by mengxue

#### 2016.11.15

- 增加了alert到wx.showModal的转换

## 需求
由于目前要维护同一项目的H5和微信小程序（以下简称MINA）两套版本，并且目前已经基本完成H5的第一版需求的开发工作，故编写了这个将Vue代码转换至MINA代码的工具。

## 安装
```bash
git clone root@192.168.1.16:KevinTang/xhc_Vue2MINA.git
cd xhc_Vue2MINA
npm i
```

## 用法
```bash
node vue2MINA 要处理的Vue文件
```

Example
```bash
node .\vue2MINA ~\work\xhc_weChatApp_H5\src\Index.vue
```

## 特性

下面是截至到 2016年10月30日 已完成的特性

#### Template(Html->Wxml)部分
- DOM元素的变换，例如div->view, span->text, img->image等
- CSS选择器的命名调整，当Vue文件的style部分使用了scoped属性时，统一在类选择器之前添加文件名作为作用域
- 部分DOM事件的命名调整，例如@click->ontap等
- 图片src部分修改为CDN线上地址，例如../assest/1.png -> http://s.xiaohongchun.com/lsj/1.png
- 给出需要上传至CDN的图片链接警告
- 部分控制字段的变换，例如v-if->wx:if, v-for->wx:for等
- 将Vue的冒号绑定方式变换为标准Mustache语法
- 未被识别的HTML标签原样输出并给出警告
- HTML Format

#### Style(Css->Wxss)部分
- CSS选择器的命名调整，当Vue文件的style部分使用了scoped属性时，统一在类选择器之前添加文件名作为作用域
- 单位转换，将rem单位变换至rpx单位
- CSS Format

#### Script(Js)部分
- 将exportDefault语句调整为Page的调用语句
- Vue的双向数据绑定调整到MINA的单项数据绑定，即this成员的赋值语句调整为this.setData的调用语句
- 在Page调用部分，增加了MINA独有的成员方法OnReachBottom和OnPullDownRefresh
- 展平Vue中mehtods和computed中的成员
- 根据Vue中components所指明的组件，删除了对应的引用语句
- 删除了Vue中components成员
- 当data成员为函数时，将Return语句中的Object表达式提升至data成员的值属性
- 生命周期函数的更名，例如created->onLoad, deactived->onUnload
- 为onLoad函数添加了调用参数params，用于接收MINA中的动态路由参数
- Js Format


## 未来特性

#### Template(Html->Wxml)部分
- 事件修饰符的支持

#### Style(Css->Wxss)部分
暂无

#### Script(Js)部分
- 连续this赋值语句合并到同一个this.setData调用语句中
- Vue路由的映射
- 浏览器BOM成员的映射



逆光
2016年10月30日