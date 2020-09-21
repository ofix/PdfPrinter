const PdfPrinter=require('./PdfPrinter');
let printer = new PdfPrinter('https://httpd.apache.org/docs/trunk/zh-cn/','The Boost C++ Libraries');
printer.setEntryCss('.toc > li ','span > a','ul > li');
printer.run();