
(async function initEmbroideryWidget() {
  const shopDomain = Shopify.shop;
  const productId = 'null';
  let addonVariants = [];
  let imageVariantId = null;
  let activeColors = [
    { name: "Black", hex: "#000000" },
    { name: "White", hex: "#FFFFFF" },
    { name: "Red", hex: "#CC0000" },
    { name: "Navy Blue", hex: "#001F5B" },
    { name: "Royal Blue", hex: "#4169E1" },
    { name: "Sky Blue", hex: "#87CEEB" },
    { name: "Green", hex: "#2E7D32" },
    { name: "Gold", hex: "#FFD700" },
    { name: "Silver", hex: "#C0C0C0" },
    { name: "Pink", hex: "#FF69B4" },
    { name: "Purple", hex: "#6A0DAD" },
    { name: "Orange", hex: "#FF6600" }
  ];
  let activeFonts = ["Arial", "Great Vibes", "Pacifico", "Dancing Script", "Lobster", "Alex Brush", "Parisienne", "Sacramento", "Cookie", "Charm"];
  let frameConfig = [];

  // 1. Read Settings Securely from Shop Metafields!
  
  
    try {
      const settingsObj = null;
      if (settingsObj.addonVariants && settingsObj.addonVariants.length > 0) {
        addonVariants = settingsObj.addonVariants;
      }
      if (settingsObj.colors && settingsObj.colors.length > 0) {
        activeColors = settingsObj.colors;
      }
      if (settingsObj.fonts && settingsObj.fonts.length > 0) {
        activeFonts = settingsObj.fonts;
      }
      if (settingsObj.frameConfig && settingsObj.frameConfig.length > 0) {
        frameConfig = settingsObj.frameConfig;
      }
    } catch(e) { console.log(e); }
  

  // UI Elements
  const btnExpand = document.getElementById('em-btn-expand');
  const formBox = document.getElementById('em-form-box');
  const lineInputs = [
    document.getElementById('em-line-1'),
    document.getElementById('em-line-2'),
    document.getElementById('em-line-3')
  ];
  const charCounts = [
    document.getElementById('em-char-count-1'),
    document.getElementById('em-char-count-2'),
    document.getElementById('em-char-count-3')
  ];
  const colorSwatches = document.getElementById('em-color-swatches');
  const colorLabel = document.getElementById('em-color-label');
  const colorInput = document.getElementById('em-color');
  const colorNameInput = document.getElementById('em-color-name');
  const fontSelect = document.getElementById('em-font-select');
  const sizeSliders = [
    document.getElementById('em-size-1'),
    document.getElementById('em-size-2'),
    document.getElementById('em-size-3')
  ];
  const frameSizeSelect = document.getElementById('em-frame-size');
  const frameSizeSelect2 = document.getElementById('em-frame-size-2');
  const frameSizeSelect3 = document.getElementById('em-frame-size-3');
  const placementSelect = document.getElementById('em-placement-size');
  const cartProps = document.getElementById('em-cart-properties');
  const fileInput = document.getElementById('em-file-input');
  const angleSlider = document.getElementById('em-rotation-angle');
  const angleLabel = document.getElementById('em-angle-label');
  let customCoords = null;
  window.emOverlayUpdateFunctions = [];
  
  // Tab logic
  let mode = 'text';
  const textLabel = document.getElementById('em-tab-text-label');
  const imageLabel = document.getElementById('em-tab-image-label');
  
  document.querySelectorAll('input[name="em-type"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      mode = e.target.value;
      if (mode === 'text') {
        textLabel.classList.add('em-tab-checked');
        imageLabel.classList.remove('em-tab-checked');
        document.getElementById('em-text-section').style.display = 'block';
        document.getElementById('em-image-section').style.display = 'none';
        document.getElementById('em-font-section').style.display = 'block';
        document.getElementById('em-frame-section').style.display = 'block';
        fileInput.removeAttribute('name');
        updatePreview();
      } else {
        imageLabel.classList.add('em-tab-checked');
        textLabel.classList.remove('em-tab-checked');
        document.getElementById('em-text-section').style.display = 'none';
        document.getElementById('em-image-section').style.display = 'block';
        document.getElementById('em-font-section').style.display = 'none';
        document.getElementById('em-frame-section').style.display = 'none';
        fileInput.setAttribute('name', 'properties[Uploaded_Image]');
        if(previewOverlay) previewOverlay.innerHTML = '';
        updatePreview();
      }
    });
  });

  // Accordion Logic
  btnExpand.onclick = () => {
    if (formBox.style.display === 'block') {
      formBox.style.display = 'none';
      btnExpand.classList.remove('is-open');
      document.getElementById('em-app-root').classList.remove('is-active');
      document.getElementById('em-add-to-cart-btn').style.display = 'none';
    } else {
      formBox.style.display = 'block';
      btnExpand.classList.add('is-open');
      document.getElementById('em-app-root').classList.add('is-active');
      document.getElementById('em-add-to-cart-btn').style.display = 'block';
      setupPreviewOverlay(productConfig);
      updatePreview();
    }
  };

  // Inputs Logic
  let activeLines = 1;
  const addLineBtn = document.getElementById('em-add-line-btn');
  
  lineInputs.forEach((input, index) => {
    input.addEventListener('input', () => {
      charCounts[index].innerText = input.value.length;
      updatePreview();
    });
  });

  addLineBtn.addEventListener('click', () => {
    if (activeLines === 1) {
      document.getElementById('em-line-group-2').style.display = 'block';
      activeLines = 2;
    } else if (activeLines === 2) {
      document.getElementById('em-line-group-3').style.display = 'block';
      activeLines = 3;
      addLineBtn.style.display = 'none';
    }
    updatePreview();
  });

  // 2. Read Product Coordinates from Metafields (Instant!)
  let productConfig = null;
  
  
    try {
      productConfig = null;
    } catch(e) {}
  

  if (productConfig && angleSlider) {
      angleSlider.value = productConfig.zoneAngle || 0;
      angleLabel.innerText = angleSlider.value + '°';
  }

  if (angleSlider) {
      angleSlider.addEventListener('input', (e) => {
          angleLabel.innerText = e.target.value + '°';
          if (window.emOverlayUpdateFunctions) {
              window.emOverlayUpdateFunctions.forEach(fn => fn());
          }
          updatePreview();
      });
  }

  // Fallback / Primary fetch for Variants directly from Shopify Storefront JS
  // This ensures variants load if the Liquid drop failed (e.g. not fully published but accessible)
  if (addonVariants.length === 0) {
    try {
      const prodRes = await fetch(`/products/embroidery-add-on-hidden.js`);
      if (prodRes.ok) {
        const addOnData = await prodRes.json();
        if (addOnData && addOnData.variants) {
          addonVariants = addOnData.variants;
        }
      }
    } catch(err) {
      console.log("Could not fetch addon product", err);
    }
  }

  // Final fallback to prevent empty widget if nothing works
  if (addonVariants.length === 0) {
    addonVariants = [
      { id: "fallback-text-12", title: "12cm", price: 400 },
      { id: "fallback-text-15", title: "15cm", price: 600 },
      { id: "fallback-image", title: "Image Upload", price: 300 }
    ];
  }

  // Populate Colors
  activeColors.forEach((c, idx) => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.innerHTML = '&nbsp;';
    swatch.className = 'em-swatch-item' + (idx === 0 ? ' em-swatch-active' : '');
    swatch.style.backgroundColor = c.hex || c;
    swatch.style.padding = '0';
    swatch.style.margin = '0';

      swatch.onclick = (e) => {
      e.preventDefault();
      document.querySelectorAll('.em-swatch-item').forEach(el => el.classList.remove('em-swatch-active'));
      swatch.classList.add('em-swatch-active');
      colorInput.value = c.hex || c;
      colorNameInput.value = c.name || c;
      colorLabel.innerHTML = "Select a Color: <strong>" + (c.name || c) + "</strong>";
      updatePreview();
    };
    colorSwatches.appendChild(swatch);
  });
  
  if (activeColors.length > 0) {
    const firstCol = activeColors[0];
    colorInput.value = firstCol.hex || firstCol;
    colorNameInput.value = firstCol.name || firstCol;
    colorLabel.innerHTML = "Select a Color: <strong>" + (firstCol.name || firstCol) + "</strong>";
  }

  // Populate Fonts
  activeFonts.forEach(font => {
    const opt = document.createElement('option');
    opt.value = font;
    opt.innerText = font;
    opt.style.setProperty('font-family', `"${font}", sans-serif`, 'important');
    fontSelect.appendChild(opt);
  });
  
  fontSelect.addEventListener('change', updatePreview);
  sizeSliders.forEach(slider => slider.addEventListener('input', updatePreview));
  
  placementSelect.addEventListener('change', () => {
    if (window.emOverlayUpdateFunctions) {
      window.emOverlayUpdateFunctions.forEach(fn => fn());
    }
    updatePreview();
  });

  if (frameConfig.length === 0) {
    frameConfig = [
      { name: "12cm", maxLetters: "4", price: "4.00" },
      { name: "15cm", maxLetters: "6", price: "6.00" },
      { name: "18cm", maxLetters: "8", price: "8.00" }
    ];
  }

  // Populate Frame Sizes - store variantId directly in option
  frameConfig.forEach(frame => {
    const opt = document.createElement('option');
    opt.value = frame.name;
    const formattedPrice = parseFloat(frame.price).toFixed(2);
    const maxL = frame.maxLetters || 10;
    opt.innerText = `${frame.name} - Max ${maxL} Letters (+£${formattedPrice})`;
    opt.dataset.maxLetters = maxL;
    opt.dataset.price = frame.price;
    
    // Try to match variant at population time and store ID directly
    const matchedVariant = addonVariants.find(v =>
      v.title && v.title.toLowerCase().includes(frame.name.toLowerCase().trim())
    );
    if (matchedVariant) {
      opt.dataset.variantId = matchedVariant.id;
    } else {
      // If no name match, try index-based fallback
      const idx = frameConfig.indexOf(frame);
      const textVariants = addonVariants.filter(v => !v.title.toLowerCase().includes('image'));
      if (textVariants[idx]) {
        opt.dataset.variantId = textVariants[idx].id;
        console.log('[EM] Frame "' + frame.name + '" matched by index to variant:', textVariants[idx].title);
      } else {
        console.warn('[EM] No variant found for frame:', frame.name, 'All variants:', addonVariants.map(v => v.title));
      }
    }
    
    frameSizeSelect.appendChild(opt);
    if (frameSizeSelect2) frameSizeSelect2.appendChild(opt.cloneNode(true));
    if (frameSizeSelect3) frameSizeSelect3.appendChild(opt.cloneNode(true));
  });

  // Also locate the image upload variant
  addonVariants.forEach(variant => {
    if (variant.title.toLowerCase().includes("image upload")) {
      imageVariantId = variant.id;
    }
  });

  let previewOverlay = null;

  const getDynamicZone = () => {
      let safeX = productConfig.zoneX > 100 ? (productConfig.zoneX / 600 * 100) : productConfig.zoneX;
      let safeY = productConfig.zoneY > 100 ? (productConfig.zoneY / 600 * 100) : productConfig.zoneY;
      let safeW = productConfig.zoneWidth > 100 ? (productConfig.zoneWidth / 400 * 100) : productConfig.zoneWidth;
      let safeH = productConfig.zoneHeight > 100 ? (productConfig.zoneHeight / 400 * 100) : productConfig.zoneHeight;

      let globalMaxLetters = 0;
      frameConfig.forEach(f => {
          let m = parseInt(f.maxLetters) || 0;
          if (m > globalMaxLetters) globalMaxLetters = m;
      });
      if (globalMaxLetters === 0) globalMaxLetters = 10;
      
      const fs2 = document.getElementById('em-frame-size-2');
      const fs3 = document.getElementById('em-frame-size-3');
      const grp2 = document.getElementById('em-line-group-2');
      const grp3 = document.getElementById('em-line-group-3');

      let max1 = frameSizeSelect && frameSizeSelect.selectedIndex > 0 ? parseInt(frameSizeSelect.options[frameSizeSelect.selectedIndex].dataset.maxLetters) : 0;
      let max2 = fs2 && fs2.selectedIndex > 0 && grp2 && grp2.style.display !== 'none' ? parseInt(fs2.options[fs2.selectedIndex].dataset.maxLetters) : 0;
      let max3 = fs3 && fs3.selectedIndex > 0 && grp3 && grp3.style.display !== 'none' ? parseInt(fs3.options[fs3.selectedIndex].dataset.maxLetters) : 0;
      
      let currentMax = Math.max(max1 || 0, max2 || 0, max3 || 0);
      let currentScale = currentMax > 0 ? (0.5 + (currentMax / globalMaxLetters) * 0.5) : 1;
      
      let newSafeW = safeW * currentScale;
      let newSafeH = safeH * currentScale;
      
      return {
         x: safeX + (safeW - newSafeW) / 2,
         y: safeY + (safeH - newSafeH) / 2,
         w: newSafeW,
         h: newSafeH
      };
  };

  function setupPreviewOverlay(productConfig) {
    if (!productConfig) {
      console.log("Embroidery Personalizer: No zone config found in Metafields for this product.");
      return false;
    }
    
    if (previewOverlay) return true; // Already setup

    // Extract all product media filenames to find the exact product image on the page
    const productFilenames = [
      
        null,
      
    ];

    let targetImages = [];
    const allImages = document.querySelectorAll('img');
    for (let img of allImages) {
      if (img.offsetWidth === 0 || img.offsetHeight === 0) continue;
      if (img.clientWidth < 150) continue;

      const src = img.src || img.currentSrc || img.getAttribute('srcset') || img.getAttribute('data-src') || "";
      if (!src) continue;

      const isProductImage = productFilenames.some(filename => src.includes(filename));
      if (isProductImage) {
        targetImages.push(img);
      }
    }

    if (targetImages.length === 0) {
       let largestArea = 0;
       let bestImg = null;
       for (let img of allImages) {
         if (img.offsetWidth === 0 || img.offsetHeight === 0) continue;
         if (img.closest('[class*="thumb"]') || img.closest('[id*="Thumb"]')) continue;
         
         const area = img.clientWidth * img.clientHeight;
         if (area > largestArea && area > 40000) { 
           largestArea = area;
           bestImg = img;
         }
       }
       if (bestImg) targetImages.push(bestImg);
    }
    
    if(targetImages.length > 0) {
      console.log("Embroidery Personalizer: Found " + targetImages.length + " matching images.");
      
      targetImages.forEach((targetImage, idx) => {
        let overlay = document.createElement('div');
        overlay.className = 'em-native-overlay';
        overlay.id = 'em-overlay-' + idx;
        
        let isOverlayActive = true;
        
        const updatePosition = () => {
          if (!document.body.contains(targetImage)) {
             isOverlayActive = false;
             overlay.remove();
             return;
          }

          const computedStyle = window.getComputedStyle(targetImage);
          const computedPos = computedStyle.position;
          
          let offsetParent = targetImage.offsetParent;
          
          if (computedPos === 'fixed') {
              overlay.style.position = 'fixed';
              if (overlay.parentNode !== document.body) document.body.appendChild(overlay);
          } else {
              overlay.style.position = 'absolute';
              if (!offsetParent || offsetParent === document.body) {
                  offsetParent = document.body;
              }
              if (overlay.parentNode !== offsetParent) offsetParent.appendChild(overlay);
          }

          const dZone = getDynamicZone();
          let safeX = dZone.x;
          let safeY = dZone.y;
          const safeW = dZone.w;
          const safeH = dZone.h;
          const angle = parseInt(angleSlider ? angleSlider.value : 0) || 0;

          const placement = placementSelect.value;
          if (placement === 'Right Chest') {
             safeX = 100 - safeX - safeW; 
          } else if (placement === 'Center' || placement === 'Back') {
             safeX = 50 - (safeW / 2);
          } else if (placement === 'Custom' && customCoords) {
             safeX = customCoords.x;
             safeY = customCoords.y;
          }

          const imgRect = targetImage.getBoundingClientRect();
          let exactLeft, exactTop;

          if (computedPos === 'fixed') {
             exactLeft = imgRect.left;
             exactTop = imgRect.top;
          } else {
             let docScrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
             let docScrollTop = window.pageYOffset || document.documentElement.scrollTop;

             if (offsetParent === document.body || offsetParent === document.documentElement) {
                 exactLeft = imgRect.left + docScrollLeft;
                 exactTop = imgRect.top + docScrollTop;
             } else {
                 const parentRect = offsetParent.getBoundingClientRect();
                 const parentComputed = window.getComputedStyle(offsetParent);
                 const borderLeft = parseFloat(parentComputed.borderLeftWidth) || 0;
                 const borderTop = parseFloat(parentComputed.borderTopWidth) || 0;
                 
                 exactLeft = imgRect.left - parentRect.left - borderLeft + offsetParent.scrollLeft;
                 exactTop = imgRect.top - parentRect.top - borderTop + offsetParent.scrollTop;
             }
          }

          const rawWidth = imgRect.width * (safeW / 100);
          const rawHeight = imgRect.height * (safeH / 100);
          const exactOverlayWidth = Math.max(rawWidth, rawHeight);
          const exactOverlayHeight = exactOverlayWidth;

          const exactOverlayLeft = exactLeft + (imgRect.width * (safeX / 100)) - (exactOverlayWidth - rawWidth) / 2;
          const exactOverlayTop = exactTop + (imgRect.height * (safeY / 100)) - (exactOverlayHeight - rawHeight) / 2;

          overlay.style.left = exactOverlayLeft + 'px';
          overlay.style.top = exactOverlayTop + 'px';
          overlay.style.width = exactOverlayWidth + 'px';
          overlay.style.height = exactOverlayHeight + 'px';
          
          overlay.style.transform = `rotate(${angle}deg)`;
          overlay.style.transformOrigin = 'center center';
          
          const sizeMultiplier = parseFloat(sizeSliders[0].value || 50) / 50;
          const calcSize = exactOverlayHeight * 0.25 * sizeMultiplier;
          overlay.style.fontSize = calcSize + 'px';
          
          overlay.style.opacity = computedStyle.opacity;
          overlay.style.display = computedStyle.display === 'none' ? 'none' : 'flex';

          if (placement === 'Custom') {
             overlay.style.pointerEvents = 'auto';
             overlay.style.cursor = 'move';
          } else {
             overlay.style.pointerEvents = 'none';
             overlay.style.cursor = 'default';
          }
          
          if (isOverlayActive && !isDragging) {
             requestAnimationFrame(updatePosition);
          }
        };

        window.emOverlayUpdateFunctions.push(updatePosition);
        requestAnimationFrame(updatePosition);
        const resizeObserver = new ResizeObserver(() => updatePosition());
        resizeObserver.observe(targetImage);

        overlay.innerHTML = '<span class="em-p-text-instance" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; overflow: hidden; text-align: center; pointer-events: none;"></span>';
        overlay.style.border = '2px dotted rgba(44, 110, 203, 0.8)';
        overlay.style.borderRadius = '50%';
        overlay.style.backgroundColor = 'rgba(44, 110, 203, 0.1)';
        overlay.style.boxSizing = 'border-box';
        
        let isDragging = false;
        let startX, startY, initialLeft, initialTop;

        const onPointerDown = (e) => {
          if (placementSelect.value !== 'Custom') return;
          isDragging = true;
          startX = e.clientX || (e.touches && e.touches[0].clientX);
          startY = e.clientY || (e.touches && e.touches[0].clientY);
          initialLeft = overlay.offsetLeft;
          initialTop = overlay.offsetTop;
          e.preventDefault();
        };

        const onPointerMove = (e) => {
          if (!isDragging) return;
          const clientX = e.clientX || (e.touches && e.touches[0].clientX);
          const clientY = e.clientY || (e.touches && e.touches[0].clientY);
          const dx = clientX - startX;
          const dy = clientY - startY;
          overlay.style.left = (initialLeft + dx) + 'px';
          overlay.style.top = (initialTop + dy) + 'px';
        };

        const onPointerUp = (e) => {
          if (!isDragging) return;
          isDragging = false;
          
          const imgRect = targetImage.getBoundingClientRect();
          const overlayRect = overlay.getBoundingClientRect();
          const pixelX = overlayRect.left - imgRect.left;
          const pixelY = overlayRect.top - imgRect.top;
          
          const dZone = getDynamicZone();
          const rawW = imgRect.width * (dZone.w / 100);
          const rawH = imgRect.height * (dZone.h / 100);
          const diameter = Math.max(rawW, rawH);
          
          const safeXPixels = pixelX + (diameter - rawW) / 2;
          const safeYPixels = pixelY + (diameter - rawH) / 2;

          customCoords = {
             x: (safeXPixels / imgRect.width) * 100,
             y: (safeYPixels / imgRect.height) * 100
          };
          window.emOverlayUpdateFunctions.forEach(fn => fn());
          updatePreview();
        };

        overlay.addEventListener('mousedown', onPointerDown);
        document.addEventListener('mousemove', onPointerMove);
        document.addEventListener('mouseup', onPointerUp);
        overlay.addEventListener('touchstart', onPointerDown, {passive: false});
        document.addEventListener('touchmove', onPointerMove, {passive: false});
        document.addEventListener('touchend', onPointerUp);
        
        // Make sure it has a high z-index
        overlay.style.zIndex = '99';
      });
      
      previewOverlay = true; // Mark as initialized
    }
    
    // Zoom / Lightbox Observer: Watch for new product images being added to the DOM
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        if (mutation.addedNodes) {
          mutation.addedNodes.forEach(node => {
            if (node.tagName === 'IMG' || (node.querySelectorAll && node.querySelectorAll('img').length > 0)) {
              const imgs = node.tagName === 'IMG' ? [node] : node.querySelectorAll('img');
              imgs.forEach(img => {
                if (img.clientWidth < 150) return;
                const src = img.src || img.currentSrc || img.getAttribute('data-src') || "";
                if (src && productFilenames.some(filename => src.includes(filename))) {
                  // Wait a brief moment for the image to fully render its size in the lightbox
                  setTimeout(() => {
                    if (img.closest('.em-native-overlay')) return; // ignore overlays
                    if (img.nextElementSibling && img.nextElementSibling.classList.contains('em-native-overlay')) return; // already added

                    let overlay = document.createElement('div');
                    overlay.className = 'em-native-overlay';
                    let isOverlayActive = true;
                    
                    const updatePosition = () => {
                      if (!document.body.contains(img)) {
                         isOverlayActive = false;
                         overlay.remove();
                         return;
                      }

                      const computedStyle = window.getComputedStyle(img);
                      const computedPos = computedStyle.position;
                      
                      let offsetParent = img.offsetParent;
                      
                      if (computedPos === 'fixed') {
                          overlay.style.position = 'fixed';
                          if (overlay.parentNode !== document.body) document.body.appendChild(overlay);
                      } else {
                          overlay.style.position = 'absolute';
                          if (!offsetParent || offsetParent === document.body) {
                              offsetParent = document.body;
                          }
                          if (overlay.parentNode !== offsetParent) offsetParent.appendChild(overlay);
                      }

                      const dZone = getDynamicZone();
                      let safeX = dZone.x;
                      let safeY = dZone.y;
                      const safeW = dZone.w;
                      const safeH = dZone.h;
                      const angle = parseInt(angleSlider ? angleSlider.value : 0) || 0;

                      const placement = placementSelect.value;
                      if (placement === 'Right Chest') {
                         safeX = 100 - safeX - safeW; 
                      } else if (placement === 'Center' || placement === 'Back') {
                         safeX = 50 - (safeW / 2);
                      } else if (placement === 'Custom' && customCoords) {
                         safeX = customCoords.x;
                         safeY = customCoords.y;
                      }

                      const imgRect = img.getBoundingClientRect();
                      let exactLeft, exactTop;

                      if (computedPos === 'fixed') {
                         exactLeft = imgRect.left;
                         exactTop = imgRect.top;
                      } else {
                         let docScrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
                         let docScrollTop = window.pageYOffset || document.documentElement.scrollTop;

                         if (offsetParent === document.body || offsetParent === document.documentElement) {
                             exactLeft = imgRect.left + docScrollLeft;
                             exactTop = imgRect.top + docScrollTop;
                         } else {
                             const parentRect = offsetParent.getBoundingClientRect();
                             const parentComputed = window.getComputedStyle(offsetParent);
                             const borderLeft = parseFloat(parentComputed.borderLeftWidth) || 0;
                             const borderTop = parseFloat(parentComputed.borderTopWidth) || 0;
                             
                             exactLeft = imgRect.left - parentRect.left - borderLeft + offsetParent.scrollLeft;
                             exactTop = imgRect.top - parentRect.top - borderTop + offsetParent.scrollTop;
                         }
                      }

                      const rawWidth = imgRect.width * (safeW / 100);
                      const rawHeight = imgRect.height * (safeH / 100);
                      const exactOverlayWidth = Math.max(rawWidth, rawHeight);
                      const exactOverlayHeight = exactOverlayWidth;

                      const exactOverlayLeft = exactLeft + (imgRect.width * (safeX / 100)) - (exactOverlayWidth - rawWidth) / 2;
                      const exactOverlayTop = exactTop + (imgRect.height * (safeY / 100)) - (exactOverlayHeight - rawHeight) / 2;

                      overlay.style.left = exactOverlayLeft + 'px';
                      overlay.style.top = exactOverlayTop + 'px';
                      overlay.style.width = exactOverlayWidth + 'px';
                      overlay.style.height = exactOverlayHeight + 'px';
                      
                      overlay.style.transform = `rotate(${angle}deg)`;
                      overlay.style.transformOrigin = 'center center';
                      
                      const sizeMultiplier = parseFloat(sizeSliders[0].value || 50) / 50;
                      const calcSize = exactOverlayHeight * 0.25 * sizeMultiplier;
                      overlay.style.fontSize = calcSize + 'px';
                      
                      overlay.style.opacity = computedStyle.opacity;
                      overlay.style.display = computedStyle.display === 'none' ? 'none' : 'flex';
                      
                      if (placement === 'Custom') {
                         overlay.style.pointerEvents = 'auto';
                         overlay.style.cursor = 'move';
                      } else {
                         overlay.style.pointerEvents = 'none';
                         overlay.style.cursor = 'default';
                      }
                      
                      if (isOverlayActive) {
                         requestAnimationFrame(updatePosition);
                      }
                    };
                    
                    overlay.innerHTML = '<span class="em-p-text-instance" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; overflow: hidden; text-align: center; pointer-events: none;"></span>';
                    overlay.style.border = '2px dotted rgba(44, 110, 203, 0.8)';
                    overlay.style.borderRadius = '50%';
                    overlay.style.backgroundColor = 'rgba(44, 110, 203, 0.1)';
                    overlay.style.boxSizing = 'border-box';
                    overlay.style.zIndex = '9999';

                    window.emOverlayUpdateFunctions.push(updatePosition);
                    requestAnimationFrame(updatePosition);
                    
                    // Force a re-render of the text inside the new overlay
                    updatePreview();
                  }, 100);
                }
              });
            }
          });
        }
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return true;
    
    console.log("Embroidery Personalizer: Could not find main product image on the page.");
    return false;
  }
  
  // Try to setup immediately, but it will also run when they click the "Make Personalization" button
  if (productConfig) {
    setupPreviewOverlay(productConfig);
    // If it fails because images aren't loaded yet, try again on window load
    window.addEventListener('load', () => setupPreviewOverlay(productConfig));
  }

  const setupFrameSelect = (selectElem, lineIndex) => {
    if (!selectElem) return;
    selectElem.addEventListener('change', () => {
      const selectedOpt = selectElem.options[selectElem.selectedIndex];
      const maxL = selectedOpt.dataset.maxLetters || 10;
      
      lineInputs[lineIndex].removeAttribute('disabled');
      lineInputs[lineIndex].setAttribute('placeholder', `Line ${lineIndex + 1}`);
      sizeSliders[lineIndex].removeAttribute('disabled');
      
      lineInputs[lineIndex].setAttribute('maxlength', maxL);
      if (lineInputs[lineIndex].value.length > maxL) {
        lineInputs[lineIndex].value = lineInputs[lineIndex].value.substring(0, maxL);
      }
      charCounts[lineIndex].innerText = lineInputs[lineIndex].value.length;
      charCounts[lineIndex].nextElementSibling.innerText = maxL;
      
      if (lineIndex === 0) {
        document.getElementById('em-add-line-btn').style.opacity = '1';
        document.getElementById('em-add-line-btn').style.pointerEvents = 'auto';
      }
      
      updatePreview();
    });
  };

  setupFrameSelect(frameSizeSelect, 0);
  setupFrameSelect(frameSizeSelect2, 1);
  setupFrameSelect(frameSizeSelect3, 2);

  function updatePreview() {
    if (mode === 'text' && previewOverlay) {
      const overlays = document.querySelectorAll('.em-native-overlay');
      overlays.forEach(overlay => {
        overlay.innerHTML = '';
        overlay.style.display = 'flex';
        overlay.style.flexDirection = 'column';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.color = colorInput.value;
        overlay.style.setProperty('font-family', `"${fontSelect.value}", sans-serif`, 'important');
        
        const linesToDraw = [];
        
        const isPlaceholder1 = lineInputs[0].value.trim() === '';
        linesToDraw.push({ text: isPlaceholder1 ? "Line 1" : lineInputs[0].value, sizeSlider: sizeSliders[0].value, isPlaceholder: isPlaceholder1 });
        
        if (activeLines >= 2) {
          const isPlaceholder2 = lineInputs[1].value.trim() === '';
          linesToDraw.push({ text: isPlaceholder2 ? "Line 2" : lineInputs[1].value, sizeSlider: sizeSliders[1].value, isPlaceholder: isPlaceholder2 });
        }
        if (activeLines >= 3) {
          const isPlaceholder3 = lineInputs[2].value.trim() === '';
          linesToDraw.push({ text: isPlaceholder3 ? "Line 3" : lineInputs[2].value, sizeSlider: sizeSliders[2].value, isPlaceholder: isPlaceholder3 });
        }

        let allPlaceholders = linesToDraw.every(l => l.isPlaceholder);
        overlay.style.border = `2px dotted ${colorInput.value}`;
        overlay.style.borderRadius = '50%';
        overlay.style.backgroundColor = allPlaceholders ? 'rgba(0, 0, 0, 0.05)' : 'transparent';

        linesToDraw.forEach((line) => {
          const span = document.createElement('span');
          span.innerText = line.text;
          span.style.opacity = line.isPlaceholder ? '0.5' : '1';
          span.style.lineHeight = '1.2';
          span.style.whiteSpace = 'nowrap';
          
          const sizeMultiplier = parseFloat(line.sizeSlider) / 50;
          const baseHeight = overlay.clientHeight;
          const calcSize = baseHeight * 0.25 * sizeMultiplier;
          span.style.fontSize = calcSize + 'px';
          overlay.appendChild(span);
        });
      });
      
      let sizeText = frameSizeSelect.options[frameSizeSelect.selectedIndex]?.text || "None";
      let placementText = placementSelect ? placementSelect.value : "Left Chest";
      if (placementText === 'Custom' && customCoords) {
          placementText = `Custom (X: ${Math.round(customCoords.x)}%, Y: ${Math.round(customCoords.y)}%)`;
      }
      let props = `Font: ${fontSelect.value} | Color: ${colorNameInput.value} | Placement: ${placementText}`;
      if (angleSlider && angleSlider.value !== "0") {
         props += ` | Angle: ${angleSlider.value}°`;
      }
      props += ` | Line 1: ${lineInputs[0].value} (Frame: ${sizeText})`;
      if (activeLines >= 2) {
          let sizeText2 = frameSizeSelect2.options[frameSizeSelect2.selectedIndex]?.text || "None";
          props += ` | Line 2: ${lineInputs[1].value} (Frame: ${sizeText2})`;
      }
      if (activeLines >= 3) {
          let sizeText3 = frameSizeSelect3.options[frameSizeSelect3.selectedIndex]?.text || "None";
          props += ` | Line 3: ${lineInputs[2].value} (Frame: ${sizeText3})`;
      }
      
      cartProps.value = props;
    } else {
      cartProps.value = `Type: Image Upload | Color: ${colorNameInput.value}`;
    }

    updatePriceDisplay();
  }

  const emBasePrice = null;
  const emShopCurrency = 'null';

  const updatePriceDisplay = () => {
    let extraCost = 0;
    if (mode === 'text') {
      const selects = [document.getElementById('em-frame-size'), document.getElementById('em-frame-size-2'), document.getElementById('em-frame-size-3')];
      selects.forEach((selectElem, index) => {
         if (index < activeLines && selectElem && selectElem.selectedIndex > 0) {
             const opt = selectElem.options[selectElem.selectedIndex];
             if (opt.dataset.price) {
                 extraCost += parseFloat(opt.dataset.price);
             }
         }
      });
    } else if (mode === 'image' && imageVariantId) {
      const imgVar = addonVariants.find(v => v.id === imageVariantId);
      if (imgVar && imgVar.price) {
         extraCost += (parseFloat(imgVar.price) / 100);
      }
    }

    const newTotal = (emBasePrice + extraCost).toFixed(2);
    const priceNodes = document.querySelectorAll('.price-item--regular, .price-item--sale, .product-single__price, .price__regular .price-item, .price__container .price-item, .price-list .price-item');
    
    priceNodes.forEach(node => {
       if (/\d/.test(node.innerText) && !node.closest('s') && !node.closest('strike')) {
                      node.innerHTML = emShopCurrency + newTotal;
       }
    });
  };

  // ============================================================
  // OUR OWN ADD TO CART BUTTON - No theme interception needed!
  // ============================================================
  const emAddToCartBtn = document.getElementById('em-add-to-cart-btn');
  if (emAddToCartBtn) {
    emAddToCartBtn.addEventListener('click', async function() {
      emAddToCartBtn.disabled = true;
      emAddToCartBtn.textContent = 'Adding...';

      const loaderOverlay = document.getElementById('em-loader-overlay');
      if (loaderOverlay) {
        loaderOverlay.style.display = 'flex';
        loaderOverlay.innerHTML = '<div class="em-spinner"></div><div class="em-loader-text">Adding to cart...</div>';
      }

      try {
        // Step 1: Get the main product variant
        const variantId = null;
        const qtyInput = document.querySelector('input[name="quantity"], .quantity__input');
        const qty = qtyInput ? (parseInt(qtyInput.value) || 1) : 1;

        // Step 2: Build line properties from widget
        const cartPropsEl = document.getElementById('em-cart-properties');
        const lineProperties = {};
        if (cartPropsEl && cartPropsEl.value) {
          lineProperties['Personalization_Details'] = cartPropsEl.value;
        }

        // Step 3: Add the main product to cart
        const mainRes = await fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: variantId,
            quantity: qty,
            properties: lineProperties
          })
        });

        if (!mainRes.ok) {
          const err = await mainRes.json();
          alert('Error adding product: ' + (err.description || 'Please try again'));
          return;
        }

        // Step 4: Build addon items (frames) using stored variantId from dataset
        let addons = [];
        if (mode === 'text') {
          const selects = [
            { el: frameSizeSelect, line: 'Line 1' },
            { el: frameSizeSelect2, line: 'Line 2' },
            { el: frameSizeSelect3, line: 'Line 3' }
          ];
          for (let i = 0; i < activeLines; i++) {
            const sel = selects[i];
            if (sel.el && sel.el.selectedIndex > 0) {
              const opt = sel.el.options[sel.el.selectedIndex];
              const directVariantId = opt.dataset.variantId;
              const variantTitle = opt.value;
              
              let resolvedId = null;
              if (directVariantId) {
                // Best case: use directly stored ID
                resolvedId = directVariantId;
              } else {
                // Fallback: try string matching
                const matchingVariant = addonVariants.find(v =>
                  v.title && v.title.toLowerCase().includes(variantTitle.toLowerCase().trim())
                );
                if (matchingVariant) {
                  resolvedId = matchingVariant.id;
                }
              }
              
              if (resolvedId) {
                const existing = addons.find(a => a.id === resolvedId);
                if (existing) {
                  existing.quantity += qty;
                } else {
                  addons.push({
                    id: parseInt(resolvedId),
                    quantity: qty,
                    properties: { 'For_Product': 'Embroidery - ' + sel.line + ' (' + variantTitle + ')' }
                  });
                }
              } else {
                console.warn('[EM] Could not find variant for frame:', variantTitle);
                console.log('[EM] addonVariants:', JSON.stringify(addonVariants.map(v => ({id: v.id, title: v.title}))));
              }
            }
          }
        } else if (mode === 'image' && imageVariantId) {
          addons.push({
            id: imageVariantId,
            quantity: qty,
            properties: { 'For_Product': 'Image Embroidery' }
          });
        }

        // Step 5: Add addon frames to cart
        if (addons.length > 0) {
          const addonRes = await fetch('/cart/add.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: addons })
          });
          if (!addonRes.ok) {
            console.error('[EM] Failed to add addon frames');
          }
        }

        // Step 6: Redirect to cart
        window.location.href = '/cart';

      } catch(e) {
        console.error('[EM] Error:', e);
        alert('Something went wrong. Please try again.');
      } finally {
        if (loaderOverlay) loaderOverlay.style.display = 'none';
        emAddToCartBtn.disabled = false;
        emAddToCartBtn.textContent = '🛒 Add to Cart with Embroidery';
      }
    });
  }

})();
