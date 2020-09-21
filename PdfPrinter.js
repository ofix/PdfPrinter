const fs = require('fs');
const https = require('https');
const iconv = require("iconv-lite");
const puppeteer = require('puppeteer-core');
const cheerio = require('cheerio');
const PDFMerger = require('pdf-merger-js');
const chromePath = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";

class PdfPrinter {
    constructor(pdfEntry, pdfName) {
        this.pdfEntry = pdfEntry;
        this.pdfName = pdfName;
        this.cacheFile = pdfName + '.json'
        this.chapterEntries = []; //目录名和地址
        this.chapterCount = 0;
        this.chapterEntriesFlat = []; //没有递归的数组
        this.css_container = '';
        this.css_level_one = '';
        this.css_level_two = "";
        this.debug = true;
        this.hasDirtyElement = true;
        this.visible_node = "";
        this.invisible_node_children=[];
    }
    setEntryCss(css_container, css_level_one, css_level_two) {
        this.css_container = css_container;
        this.css_level_one = css_level_one;
        this.css_level_two = css_level_two;
    }
    setVisibleNode(visible_node) {
        this.visible_node = visible_node;
    }
    setInvisibleNodeChildren(invisible_node_children){
        this.invisible_node_children = invisible_node_children;
    }
    setNoDirtyElement() {
        this.hasDirtyElement = false;
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
            await this.printChapters(browser, this.chapterEntriesFlat);
            await browser.close();
        }).then(async () => {
            await this.mergePartPdfFiles(this.chapterEntriesFlat, this.pdfName);
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

    arrayRecursiveToFlat(arr) {
        for (let i = 0; i < arr.length; i++) {
            this.chapterEntriesFlat.push(arr[i]);
            if (arr[i].children.length > 0) {
                this.arrayRecursiveToFlat(arr[i].children);
            }
        }
    }

    async onFinishPdfEntry(result, that) {
        if (typeof result === 'string') {
            that.parsePdfEntry(result, that);
            that.saveCacheFile();
        }
        that.chapterCount = that.getPageCount(that.chapterEntries);
        that.arrayRecursiveToFlat(that.chapterEntries);
        console.log("chapter count: ", that.chapterCount);
    }
    async printChapters(browser, chapters) {
        for (let i = 0; i < chapters.length; i++) {
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
            await this.printPage(browser, url, elementId.toLowerCase(), chapter_name);
            await this.sleep(1000);
        }
    }
    async printPage(browser, url, elementId, filename) {
        console.log(">>>>>> in print " + filename + ".pdf");
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle2' });
        await page.emulateMediaType('screen');
        if (this.hasDirtyElement) {
            console.log("REMOVE DIRTY ELEMENTS");
            console.log("elementId: ", elementId);
            await page.evaluate((visibleElementId) => {
                let elements = document.querySelector('body').children;
                for (let i = 0; i < elements.length; i++) {
                    if (elements[i].id != visibleElementId) {
                        elements[i].style.display = 'none';
                    }
                }
            }, elementId);
        }
        await page.pdf({
            path: "./temp/" + filename + '.pdf',
            format: 'A4',
            printBackground: true,
        });
    }

    async mergePartPdfFiles(data, fileName) {
        console.log("++++++++++ 合并 " + fileName + ".pdf ++++++++++");
        var merger = new PDFMerger();
        for (let i = 0; i < data.length; i++) {
            if (data[i].name == 'Index') {
                continue;
            }
            merger.add("./temp/" + data[i].name + '.pdf');
        }
        await merger.save('./ebooks/' + fileName + '.pdf');
    }

    removeDirtyElements(elementId) {
        const elements = document.querySelector('body').children;
        for (let i = 0; i < elements.length; i++) {
            if (elements[i].id != elementId) {
                elements[i].style.display = 'none';
            }
        }
    }

    getPageCount(arr) {
        let total = 0;
        for (let i = 0; i < arr.length; i++) {
            if (arr[i]["children"].length == 0) {
                total += 1;
            } else {
                total += this.getPageCount(arr[i].children);
            }
        }
        return total;

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
    parsePdfEntry(data, that) {
        let $ = cheerio.load(data);
        let $container = $(that.css_container);
        that.visitChildrenNodes(that, $, $container, 0, that.chapterEntries, that);
    }

    visitChildrenNodes(root, $, $parent, level, parent, that) {
        $parent.each((index, item) => {
            let $a = '';
            if (level == 0) {
                $a = $(item).find(that.css_level_one);
            } else {
                $a = $(item).is('a') ? $(item) : $(item).find(that.css_level_one);
            }
            let _href_ = $a.attr('href');
            let href = '';
            if (_href_ != undefined) {
                if (_href_.substr(0, 4) == 'http') {
                    href = $a.attr('href');
                } else {
                    href = root.pdfEntry + $a.attr('href');
                }
            }
            let name = $a.text();
            let o = { name: name, href: href, level: level, children: [] };
            let $children = $(item).find(that.css_level_two);
            if ($children.length) {
                root.visitChildrenNodes(root, $, $children, level + 1, o.children, that);
            }
            parent.push(o);
        });
    }
}

module.exports = PdfPrinter;