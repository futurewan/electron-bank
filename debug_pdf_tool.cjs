const fs = require('fs');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

async function run() {
    const filePath = '/Users/taolijun/Documents/code/electron-bank/24332001111494769913.pdf';
    if (!fs.existsSync(filePath)) {
        console.error('File not found:', filePath);
        return;
    }
    const buffer = fs.readFileSync(filePath);

    // Convert Buffer to Uint8Array
    const uint8Array = new Uint8Array(buffer);

    try {
        const loadingTask = pdfjsLib.getDocument(uint8Array);
        const doc = await loadingTask.promise;

        let fullText = "";
        for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i);
            const content = await page.getTextContent();

            // Items is array of {str: "string", ...}
            const strings = content.items.map(function (item) {
                return item.str;
            });

            fullText += strings.join(" ") + "\n";
        }

        console.log('--- EXTRACTED TEXT ---');
        console.log(fullText);
        console.log('--- END ---');

    } catch (err) {
        console.error('Error:', err);
    }
}

run();
