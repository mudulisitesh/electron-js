const { ipcRenderer } = require('electron');
pdfjsLib.GlobalWorkerOptions.workerSrc = 'node_modules/pdfjs-dist/build/pdf.worker.js';

let pdfDoc = null;
let pageNum = 1;
let scale = 1.0;
let rotation = 0;
let pageWidth = 0;
let pageHeight = 0;
let searchResults = [];
let currentSearchIndex = -1;
let textContent = null;
let textLayer = null;

const canvas = document.getElementById('pdfViewer');
const ctx = canvas.getContext('2d');
const spinner = document.querySelector('.loading-spinner');

// Elements
const openFileBtn = document.getElementById('openFile');
const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');
const zoomInBtn = document.getElementById('zoomIn');
const zoomOutBtn = document.getElementById('zoomOut');
const fitToWidthBtn = document.getElementById('fitToWidth');
const fitToPageBtn = document.getElementById('fitToPage');
const rotateCWBtn = document.getElementById('rotateCW');
const rotateCCWBtn = document.getElementById('rotateCCW');
const pageInfo = document.getElementById('pageInfo');
const scaleValue = document.querySelector('.scale-value');
const toggleSidebarBtn = document.querySelector('.toggle-sidebar');
const sidebar = document.querySelector('.sidebar');

function showSpinner() {
  spinner.style.display = 'block';
}

function hideSpinner() {
  spinner.style.display = 'none';
}

function updateScaleDisplay() {
  scaleValue.textContent = `${Math.round(scale * 100)}%`;
}

async function loadPDF(path) {
  showSpinner();
  try {
    pdfDoc = await pdfjsLib.getDocument(path).promise;
    pageNum = 1;
    rotation = 0;
    await renderPage(pageNum);
    updatePageInfo();
    updateControlStates();
  } catch (error) {
    console.error('Error loading PDF:', error);
  } finally {
    hideSpinner();
  }
}

async function renderPage(num) {
  showSpinner();
  try {
    const page = await pdfDoc.getPage(num);
    const viewport = page.getViewport({ scale, rotation });
    
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    pageWidth = viewport.width;
    pageHeight = viewport.height;

    await page.render({
      canvasContext: ctx,
      viewport: viewport
    }).promise;

    canvas.style.transform = 'scale(1)';
    void canvas.offsetHeight; // Force reflow
    canvas.style.transform = 'scale(1.01)';
    setTimeout(() => {
      canvas.style.transform = 'scale(1)';
    }, 100);
  } catch (error) {
    console.error('Error rendering page:', error);
  } finally {
    hideSpinner();
  }
}

function updatePageInfo() {
  pageInfo.textContent = `Page: ${pageNum}/${pdfDoc ? pdfDoc.numPages : 1}`;
}

function updateControlStates() {
  prevPageBtn.disabled = pageNum <= 1;
  nextPageBtn.disabled = !pdfDoc || pageNum >= pdfDoc.numPages;
  zoomInBtn.disabled = scale >= 3;
  zoomOutBtn.disabled = scale <= 0.25;
}

function fitToWidth() {
  if (!pdfDoc) return;
  const container = document.querySelector('.main-content');
  const padding = 40; // Account for container padding
  scale = (container.clientWidth - padding) / (pageWidth / scale);
  scale = Math.min(3, scale); // Cap at 300%
  renderPage(pageNum);
  updateScaleDisplay();
  updateControlStates();
}

function fitToPage() {
  if (!pdfDoc) return;
  const container = document.querySelector('.main-content');
  const padding = 40;
  const widthScale = (container.clientWidth - padding) / (pageWidth / scale);
  const heightScale = (container.clientHeight - padding) / (pageHeight / scale);
  scale = Math.min(widthScale, heightScale);
  scale = Math.min(3, scale); // Cap at 300%
  renderPage(pageNum);
  updateScaleDisplay();
  updateControlStates();
}

// Event Listeners
openFileBtn.addEventListener('click', async () => {
  const filePath = await ipcRenderer.invoke('select-pdf');
  if (filePath) {
    loadPDF(filePath);
  }
});

prevPageBtn.addEventListener('click', () => {
  if (pdfDoc && pageNum > 1) {
    pageNum--;
    renderPage(pageNum);
    updatePageInfo();
    updateControlStates();
  }
});

nextPageBtn.addEventListener('click', () => {
  if (pdfDoc && pageNum < pdfDoc.numPages) {
    pageNum++;
    renderPage(pageNum);
    updatePageInfo();
    updateControlStates();
  }
});

zoomInBtn.addEventListener('click', () => {
  if (scale < 3) {
    scale += 0.25;
    renderPage(pageNum);
    updateScaleDisplay();
    updateControlStates();
  }
});

zoomOutBtn.addEventListener('click', () => {
  if (scale > 0.25) {
    scale -= 0.25;
    renderPage(pageNum);
    updateScaleDisplay();
    updateControlStates();
  }
});

fitToWidthBtn.addEventListener('click', fitToWidth);
fitToPageBtn.addEventListener('click', fitToPage);

rotateCWBtn.addEventListener('click', () => {
  rotation = (rotation + 90) % 360;
  renderPage(pageNum);
});

rotateCCWBtn.addEventListener('click', () => {
  rotation = (rotation - 90) % 360;
  if (rotation < 0) rotation += 360;
  renderPage(pageNum);
});

toggleSidebarBtn.addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
  toggleSidebarBtn.classList.toggle('collapsed');
});

// Window resize handler
let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    if (pdfDoc) {
      renderPage(pageNum);
    }
  }, 200);
});

// Add these new functions to renderer.js
async function performSearch(searchTerm) {
    if (!pdfDoc || !searchTerm) return;
    
    searchResults = [];
    currentSearchIndex = -1;
    
    showSpinner();
    try {
      const page = await pdfDoc.getPage(pageNum);
      textContent = await page.getTextContent();
      const text = textContent.items.map(item => item.str).join(' ');
      
      let match;
      const searchRegex = new RegExp(searchTerm, 'gi');
      while ((match = searchRegex.exec(text)) !== null) {
        searchResults.push({
          pageNum: pageNum,
          index: match.index,
          length: searchTerm.length
        });
      }
      
      updateSearchInfo();
      if (searchResults.length > 0) {
        currentSearchIndex = 0;
        highlightSearchResults();
      }
    } catch (error) {
      console.error('Error performing search:', error);
    } finally {
      hideSpinner();
    }
  }
  
  function updateSearchInfo() {
    const searchInfo = document.getElementById('searchInfo');
    const searchPrev = document.getElementById('searchPrev');
    const searchNext = document.getElementById('searchNext');
    
    if (searchResults.length > 0) {
      searchInfo.textContent = `${currentSearchIndex + 1}/${searchResults.length}`;
      searchPrev.disabled = currentSearchIndex <= 0;
      searchNext.disabled = currentSearchIndex >= searchResults.length - 1;
    } else {
      searchInfo.textContent = 'No results';
      searchPrev.disabled = true;
      searchNext.disabled = true;
    }
  }
  
  async function highlightSearchResults() {
    if (!textContent) return;
    
    // Create text layer if it doesn't exist
    if (!textLayer) {
      textLayer = document.createElement('div');
      textLayer.className = 'text-layer';
      document.querySelector('.canvas-container').appendChild(textLayer);
    }
    
    textLayer.innerHTML = '';
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale, rotation });
    
    textContent.items.forEach((item, index) => {
      const tx = pdfjsLib.Util.transform(
        viewport.transform,
        item.transform
      );
      
      const style = textContent.styles[item.fontName];
      const fontSize = Math.sqrt((tx[0] * tx[0]) + (tx[1] * tx[1]));
      
      const span = document.createElement('span');
      span.textContent = item.str;
      span.style.fontSize = `${fontSize}px`;
      span.style.fontFamily = style.fontFamily;
      span.style.left = `${tx[4]}px`;
      span.style.top = `${tx[5]}px`;
      span.style.transform = `scaleX(${tx[0] / fontSize})`;
      
      // Check if this text should be highlighted
      const text = item.str;
      const searchTerm = document.getElementById('searchInput').value;
      if (searchTerm) {
        const regex = new RegExp(searchTerm, 'gi');
        const matches = text.matchAll(regex);
        for (const match of matches) {
          const result = searchResults[currentSearchIndex];
          if (result && match.index === result.index) {
            span.classList.add('highlight', 'selected');
          } else {
            span.classList.add('highlight');
          }
        }
      }
      
      textLayer.appendChild(span);
    });
  }
  
  // Add these event listeners after other event listeners
  const searchInput = document.getElementById('searchInput');
  const searchPrev = document.getElementById('searchPrev');
  const searchNext = document.getElementById('searchNext');
  
  searchInput.addEventListener('input', (e) => {
    performSearch(e.target.value);
  });
  
  searchPrev.addEventListener('click', () => {
    if (currentSearchIndex > 0) {
      currentSearchIndex--;
      highlightSearchResults();
      updateSearchInfo();
    }
  });
  
  searchNext.addEventListener('click', () => {
    if (currentSearchIndex < searchResults.length - 1) {
      currentSearchIndex++;
      highlightSearchResults();
      updateSearchInfo();
    }
  });
  
  // Modify the existing renderPage function to include text layer rendering
  async function renderPage(num) {
    showSpinner();
    try {
      const page = await pdfDoc.getPage(num);
      const viewport = page.getViewport({ scale, rotation });
      
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      pageWidth = viewport.width;
      pageHeight = viewport.height;
  
      await page.render({
        canvasContext: ctx,
        viewport: viewport
      }).promise;
  
      // Get text content and create text layer
      textContent = await page.getTextContent();
      highlightSearchResults();
  
      canvas.style.transform = 'scale(1)';
      void canvas.offsetHeight;
      canvas.style.transform = 'scale(1.01)';
      setTimeout(() => {
        canvas.style.transform = 'scale(1)';
      }, 100);
    } catch (error) {
      console.error('Error rendering page:', error);
    } finally {
      hideSpinner();
    }
  }

// Initialize controls
updateControlStates();
updateScaleDisplay();