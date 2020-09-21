const PdfPrinter=require('./PdfPrinter');
let printer = new PdfPrinter('https://httpd.apache.org/docs/trunk/zh-cn/','Apache2 Manual');
printer.setEntryCss('.category','h2 > a','ul > li > a');
printer.setNoDirtyElement();
printer.run();

