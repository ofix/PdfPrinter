const fs = require('fs');
const https = require('https');
const iconv = require("iconv-lite");
const puppeteer = require('puppeteer-core');
const cheerio = require('cheerio');
const PDFMerger = require('pdf-merger-js');
const process = require('process');
const chromePath = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";

class GooglePdfPrinter {
    constructor(pdfEntry, pdfName) {
        this.pdfEntry = pdfEntry;
        this.pdfName = pdfName;
        this.cacheFile = pdfName + '.json'
        this.chapterEntries = []; //目录名和地址
        this.chapterCount = 0;
        this.menu_container = '';
        this.debug = false;
        this.hasDirtyElement = false;
        this.visible_node = "";
        this.invisible_node_children = [];
        this.urlPrefix = "";//URL前缀
        this.default_config = {
            urlPrefix:'',//URL前缀，
            removePrintCss:false,//时候移除打印CSS
            dirtyInnerElements:[],//容器里面的元素
            dirtyOuterElements:[],//容器外面的元素
        };
    }
    setMenuContainer(menu_container) {
        this.menu_container = menu_container;
    }
    setVisibleNode(visible_node) {
        this.visible_node = visible_node;
    }
    setInvisibleNodeChildren(invisible_node_children) {
        this.invisible_node_children = invisible_node_children;
    }
    setNoDirtyElement() {
        this.hasDirtyElement = false;
    }
    //设置URL前缀
    setUrlPrefix(prefix) {
        this.urlPrefix = prefix;
    }
    //
    setConfig(config) {
        this.config = config;
    }
    //移除打印样式
    removePrintCss() {
        for (var i = document.styleSheets[0].rules.length - 1; i > 0; i--) {
            if (document.styleSheets[0].rules[i].cssText.indexOf("@media print") != -1) {
                document.styleSheets[0].deleteRule(i);
            }
        }
    }
    async run() {
        if (fs.existsSync(this.cacheFile)) {
            let data = fs.readFileSync(this.cacheFile, 'utf-8');
            this.chapterEntries = JSON.parse(data);
            await this.onFinishPdfEntry(null, this);
        } else {
            await this.visitEntry(this.onFinishPdfEntry);
            if (this.debug) {
                return;
            }
        }
        let launchOptions = {
            executablePath: chromePath,
            devTools: true
        };
        puppeteer.launch(launchOptions).then(async browser => {
            await this.printChapters(browser, this.chapterEntries);
            await browser.close();
        }).then(async () => {
            await this.mergePartPdfFiles(this.chapterEntries, this.pdfName);
            console.log("+++++ finish merge file ", this.pdfName + ".pdf");
        });

    }
    sleep(time = 0) {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                resolve();
            }, time);
        })
    }

    async onFinishPdfEntry(result, that) {
        if (typeof result === 'string') {
            that.parsePdfMenu(result, that);
            that.saveCacheFile();
        }
        that.chapterCount = that.chapterEntries.length;
        console.log("page count: ", that.chapterCount);
    }
    parsePdfMenu(data, that) {
        let $ = cheerio.load(data);
        let $container = $(that.menu_container);
        let $a = $container.find('a');
        $a.each((index, item) => {
            let href = $(item).attr('href');
            if (href != '' && href != undefined) {
                if (href.substr(0, 4) != 'http') {
                    href = that.urlPrefix + href;
                }
                let title = '';
                let hasChildrenNode = $(item).children().length == 0 ? false : true;
                if (!hasChildrenNode) {
                    title = $(item).text();
                } else {
                    title = $(item).find('span').text();
                }
                title = $(item).text();
                let regex = /\n\s+/g;
                title = title.replace(regex, '');
                that.chapterEntries.push({ 'href': href, 'name': title });
            }
        });
    }
    async printChapters(browser, chapters) {
        for (let i = 60; i < chapters.length; i++) {
            let url = chapters[i].href;
            if (url == '') {
                continue;
            }
            let elementId = url.substring(url.lastIndexOf('/') + 1, url.length);
            if (!this.hasDirtyElement) {
                elementId = '';
            }
            let regex = /\//g; //解决特殊字符问题
            let chapter_name = chapters[i].name.replace(regex, "_")
            await this.printPage(browser, url, chapter_name, i);
            await this.sleep(1000);
        }
    }
    async printPage(browser, url, filename, chapterNo) {
        console.log(">>>>> 正在打印 " + filename + "_" + chapterNo + ".pdf");
        const page = await browser.newPage();
        await page.setViewport({
            width: 1920,
            height: 1080,
            deviceScaleFactor: 1,
        });
        await page.goto(url, { waitUntil: 'networkidle2' });
        await page.emulateMediaType('print');
        if (this.hasDirtyElement) {
            await page.evaluate((visible_node, invisible_node_children) => {
                console.log("REMOVE DIRTY ELEMENTS");
                console.log("VISIBLE_NODE ", visible_node);
                console.log("INVISIBLE_NODE_CHILDREN ", invisible_node_children);
                const elements = document.querySelector('body').children;
                let isId = visible_node.substr(0, 1) == '#' ? true : false;
                let visible_node_id = visible_node.substring(1);
                for (let i = 0; i < elements.length; i++) {
                    if (isId) {
                        if (elements[i].id != visible_node_id) {
                            elements[i].style.display = 'none';
                        } else {
                            for (let j = 0; j < invisible_node_children.length; j++) {
                                //let childIsId = invisible_node_children[j].substr(0, 1) == '#' ? true : false;
                                let child = document.querySelector(invisible_node_children[j]);
                                console.log(invisible_node_children[j]);
                                console.log(child);
                                // if (child != undefined) {
                                //     child.sytle.display = 'none';
                                // }
                            }
                        }
                    }
                }
            }, this.visible_node, this.invisible_node_children);
            console.log(this.visible_node, this.invisible_node_children);
            // page.on('console', msg => console.log(msg.text()));
        }
        await page.pdf({
            path: "./temp/" + filename + "_" + chapterNo + '.pdf',
            format: 'A4',
            printBackground: false,
        });
    }

    async mergePartPdfFiles(data, fileName) {
        console.log("++++++++++ 合并 " + fileName + ".pdf ++++++++++");
        var merger = new PDFMerger();
        for (let i = 0; i < data.length; i++) {
            if (data[i].name == 'Index') {
                continue;
            }
            if (data[i].href == '') {
                continue;
            }
            let regex = /\//g; //解决特殊字符问题
            let chapter_name = data[i].name.replace(regex, "_")
            merger.add("./temp/" + chapter_name + "_" + i + '.pdf');
        }
        await merger.save('./ebooks/' + fileName + '.pdf');
    }

    removeDirtyElements() {
        if (this.hasDirtyElement) {
            console.log("REMOVE DIRTY ELEMENTS");
            console.log("VISIBLE_NODE ", this.visible_node);
            console.log("INVISIBLE_NODE_CHILDREN ", this.invisible_node_children);
            const elements = document.querySelector('body').children;
            let isId = this.visible_node.substr(0, 1) == '#' ? true : false;
            let visible_node_id = this.visible_node.substring(1);
            for (let i = 0; i < elements.length; i++) {
                if (isId) {
                    if (elements[i].id != visible_node_id) {
                        elements[i].style.display = 'none';
                    } else {
                        for (let j = 0; j < this.invisible_node_children.length; j++) {
                            let childIsId = this.invisible_node_children[i].substr(0, 1) == '#' ? true : false;
                            if (childIsId) {
                                document.querySelector(childIsId).style.display = 'none';
                            }
                        }
                    }
                }

            }
        }
    }


    saveCacheFile() {
        let data = JSON.stringify(this.chapterEntries, null, 4);
        fs.writeFileSync(this.cacheFile, data);
        console.log(data);
    }
    //解析网站目录
    async visitEntry(callback) {
        let that = this;
        const req = https.get(this.pdfEntry, (res) => {
            let html = [];
            let size = 0;
            res.on('data', (data) => {
                html.push(data);
                size += data.length;
            });
            res.on("end", function () {
                let buf = Buffer.concat(html, size);
                let result = iconv.decode(buf, "utf8");//转码//var result = buff.toString();//不需要转编码,直接tostring
                if (typeof callback === 'function') {
                    callback(result, that);
                }
            });
        });
        req.on('error', (e) => {
            console.error(e);
        });
    }

}
module.exports = GooglePdfPrinter;