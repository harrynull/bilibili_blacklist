# Bilibili 屏蔽词分享平台

![ss.png](https://ooo.0o0.ooo/2017/06/05/5934b6ae6e005.png)

[![Travis branch](https://img.shields.io/travis/harrynull/bilibili_blacklist/master.svg)](https://travis-ci.org/harrynull/bilibili_blacklist)
[![dependencies](https://david-dm.org/harrynull/bilibili_blacklist.svg)](https://david-dm.org/harrynull/bilibili_blacklist)
[![license](https://img.shields.io/github/license/harrynull/bilibili_blacklist.svg)](https://github.com/harrynull/bilibili_blacklist/blob/master/LICENSE)

这是一个可以用来分享、管理您在Bilibili设置的弹幕屏蔽词的网站。

请注意：这并不是Bilibili的官方网站/项目，与Bilibili官方无关。

演示站：[http://harrynull.tech/bilibili/](https://harrynull.tech/bilibili/)

## 为什么要做这个

Bilibili的弹幕环境是众所周知的不尽人意，而其自带的弹幕屏蔽系统虽然支持正则，但是普通用户难以编写，虽然网上已经有类似的屏蔽词列表，如[Bilibili-Block-List](https://github.com/jnxyp/Bilibili-Block-List)，[bili_blocklist](http://git.oschina.net/lbroot/bili_blocklist/)，[bilibili-ban-list](https://github.com/xmcp/bilibili-ban-list)等，但是由于每个人的接受能力和制作者的主观性，导致一些“误伤”的情况，例如，有的人觉得“233”是烘托气氛的弹幕，有的人觉得是无意义的刷屏弹幕。此外，操作也较为复杂，多需要手动导入xml。于是，我便想制作这样一个平台，可以让用户方便的选择自己需要屏蔽的弹幕的类型，做到按需屏蔽、一键屏蔽，在一定程度上缓解B站弹幕质量问题。

## 搭建

1. clone源码
2. ``npm install``
3. 安装[mongodb](https://www.mongodb.com/download-center?jmp=nav).
4. ``npm run build && node .``

从已有网站导入分享数据：

​	GET /fetch_sharelist 即可获得sharelist数据库的内容。
   GET /tags 即可获得tags。

​	例如：http://harrynull.tech/bilibili/fetch_sharelist。


## 使用

如果您是普通用户，您可以直接使用上方的演示站。

如果您是开发者，欢迎用上方的方法自行搭建，然后访问http://localhost:8000进行操作。

## 原理

原理详见[Wiki](https://github.com/harrynull/bilibili_blacklist/wiki)。

## 建议和BUG

欢迎[提出issue](https://github.com/harrynull/bilibili_blacklist/issues)。

## 更新

C = Change
I = Improve & Optimize
R = Remove
N = New
F = Fix

更新内容 (2017/7/23):
1. [I] 改进了UI
2. [N] 管理员删除后台
3. [F] issue #1
4. [N] 屏蔽词误伤安全级别
5. [N] 投票系统
6. [N] Tags
7. [N] 筛选&排序

更新内容 (2017/7/14)：

1. [R] 制作屏蔽列表中移除了『用户』选项，同时移除已有屏蔽列表中的『用户』屏蔽项。
2. [F] 屏蔽列表不允许重复，同时移除已有屏蔽列表中的重复项。
3. [I] 查看详细的时候不会重复下载已有数据。
4. [I] 改进了一些UI。
    1) 现在不会显示空的简介框。
5. [F] 不允许空评论，原有的空评论会被隐藏。
6. [I] 添加屏蔽词页面现在可以删除屏蔽词了。
7. [I] 使用typescript重构代码。
8. [I] 使用ejs重构代码。

## 许可证

[MIT License](https://github.com/harrynull/bilibili_blacklist/blob/master/LICENSE).

    MIT License

    Copyright (c) 2017 Null

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
