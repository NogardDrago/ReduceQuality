# ReduceQuality

A high-performance, local-first browser extension for compressing images and PDFs.

## What is ReduceQuality?

ReduceQuality is a privacy-first browser extension that allows you to easily compress and resize your images and PDF files directly within your browser. There are no server uploads involved—all processing happens entirely on your local machine using standard web technologies.

## Features

- **Local Processing**: Zero server uploads, ensuring maximum privacy and security for your documents.
- **Image Compression**: Quickly resize and compress images.
- **PDF Compression**: Optimize your PDF files to save space without losing clarity.
- **Batch Processing**: Handle multiple files simultaneously with ease. The extension will automatically package multiple output files into a convenient `.zip` format.
- **Customizable**: Tweak compression settings and naming conventions seamlessly.

## Getting Started: Local Development

Because this extension runs purely on vanilla JavaScript, HTML, and CSS (with local libraries included), there is no complex build step required!

### Running the Extension Locally (Chrome / Edge / Brave):

1. **Open your browser** and navigate to the extensions page:
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
   - Brave: `brave://extensions/`
2. Enable **Developer mode** using the toggle switch (usually in the top right corner).
3. Click the **Load unpacked** button.
4. Select the `ReduceQuality` folder (the directory containing the `manifest.json` file).
5. The extension will now be installed! Pin it to your toolbar and click the icon to test it.

*Whenever you make changes to your code, you can click the "Refresh" (circular arrow) icon on the extension's card in the `chrome://extensions/` page to reload it.*

## Technologies Used

- Manifest V3 architecture
- [JSZip](https://stuk.github.io/jszip/) for bundling compressed files
- [PDF.js](https://mozilla.github.io/pdf.js/) and [pdf-lib](https://pdf-lib.js.org/) for local PDF parsing and generation
