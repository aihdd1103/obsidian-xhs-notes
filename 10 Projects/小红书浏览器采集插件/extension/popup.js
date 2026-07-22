const DB_NAME = "xhs-collector";
const STORE = "handles";
const HANDLE_KEY = "inbox";

const folderEl = document.querySelector("#folder");
const statusEl = document.querySelector("#status");
const chooseButton = document.querySelector("#choose");
const huabanButton = document.querySelector("#huaban");
const collectButton = document.querySelector("#collect");
const runPendingButton = document.querySelector("#runPending");
const pendingButton = document.querySelector("#pending");

let inboxHandle = null;

chooseButton.addEventListener("click", chooseFolder);
huabanButton.addEventListener("click", collectHuabanPin);
collectButton.addEventListener("click", collectCurrentPage);
runPendingButton.addEventListener("click", runPendingAction);
pendingButton.addEventListener("click", collectPendingImage);

init();

async function init() {
  inboxHandle = await loadHandle();
  if (inboxHandle) {
    const hasPermission = await verifyPermission(inboxHandle, false);
    folderEl.textContent = `已记住：${inboxHandle.name}`;
    statusEl.textContent = hasPermission ? "可以开始采集。" : "已记住收件箱；保存时如弹出权限确认，点允许即可。";
  } else {
    folderEl.textContent = "未选择收件箱";
    statusEl.textContent = "请选择 Obsidian 里的 90 Assets/XHS References/浏览器采集收件箱。";
  }

  const { pendingImage, pendingAction } = await chrome.storage.session.get(["pendingImage", "pendingAction"]);
  pendingButton.disabled = !pendingImage;
  runPendingButton.disabled = !pendingAction;
}

async function chooseFolder() {
  try {
    inboxHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    if (!await verifyPermission(inboxHandle, true)) throw new Error("没有写入权限");
    await saveHandle(inboxHandle);
    folderEl.textContent = `收件箱：${inboxHandle.name}`;
    statusEl.textContent = "收件箱已保存。";
  } catch (error) {
    statusEl.textContent = `选择失败：${error.message || error}`;
  }
}

async function collectPendingImage() {
  await withBusy(async () => {
    const { pendingImage } = await chrome.storage.session.get("pendingImage");
    if (!pendingImage) {
      statusEl.textContent = "没有待保存的右键图片。";
      return;
    }
    const saved = await saveImages([pendingImage], pendingImage.pageUrl, pendingImage.pageTitle);
    await chrome.storage.session.remove("pendingImage");
    pendingButton.disabled = true;
    statusEl.textContent = `右键图片已保存 ${saved} 张。`;
  });
}

async function runPendingAction() {
  const { pendingAction } = await chrome.storage.session.get("pendingAction");
  if (!pendingAction) {
    statusEl.textContent = "没有待执行的右键采集。";
    return;
  }
  await chrome.storage.session.remove("pendingAction");
  runPendingButton.disabled = true;
  if (pendingAction.action === "huaban-main") {
    await collectHuabanPin();
  } else {
    await collectCurrentPage();
  }
}

async function collectCurrentPage() {
  await withBusy(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scanPageImages
    });
    if (!result?.length) {
      statusEl.textContent = "当前页没有识别到可采集图片。";
      return;
    }
    const saved = await saveImages(result, tab.url, tab.title, tab);
    statusEl.textContent = `识别 ${result.length} 张，已保存 ${saved} 张。`;
  });
}

async function collectHuabanPin() {
  await withBusy(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!/https?:\/\/huaban\.com\/pins\/\d+/i.test(tab.url || "")) {
      statusEl.textContent = "请先打开花瓣 pin 详情页，比如 huaban.com/pins/4098283193。";
      return;
    }
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scanHuabanMainImage
    });
    if (!result) {
      statusEl.textContent = "没有识别到花瓣主图，请确认主图在当前页面可见。";
      return;
    }
    const outcome = await saveOneWithFallback(result, tab.url, tab.title, tab);
    statusEl.textContent = outcome.method === "url"
      ? "花瓣主图已保存：原图资源。"
      : "花瓣主图已保存：截图裁切。";
  });
}

async function saveOneWithFallback(image, pageUrl, pageTitle, tab) {
  if (!inboxHandle) throw new Error("请先选择收件箱");
  if (!await verifyPermission(inboxHandle, true)) throw new Error("收件箱没有写入权限，请点“选择 Obsidian 收件箱文件夹”重新选择一次");

  const day = new Date().toISOString().slice(0, 10);
  const dayDir = await inboxHandle.getDirectoryHandle(day, { create: true });
  try {
    const blob = await fetchImageBlob(image.imageUrl);
    await writeCapture(dayDir, blob, image, pageUrl, pageTitle, "url");
    return { method: "url" };
  } catch (urlError) {
    try {
      const blob = await cropVisibleImage(tab, image);
      await writeCapture(dayDir, blob, { ...image, url_error: urlError.message || String(urlError) }, pageUrl, pageTitle, "huaban-main-screenshot");
      return { method: "screenshot" };
    } catch (cropError) {
      throw new Error(`原图失败：${urlError.message || urlError}；截图失败：${cropError.message || cropError}`);
    }
  }
}

async function saveImages(images, pageUrl = "", pageTitle = "", tab = null) {
  if (!inboxHandle) throw new Error("请先选择收件箱");
  if (!await verifyPermission(inboxHandle, true)) throw new Error("收件箱没有写入权限，请点“选择 Obsidian 收件箱文件夹”重新选择一次");

  const day = new Date().toISOString().slice(0, 10);
  const dayDir = await inboxHandle.getDirectoryHandle(day, { create: true });
  let saved = 0;
  const failures = [];

  for (const image of images.slice(0, 80)) {
    try {
      const blob = await fetchImageBlob(image.imageUrl);
      await writeCapture(dayDir, blob, image, pageUrl, pageTitle, "url");
      saved += 1;
    } catch (error) {
      failures.push({ image, error });
    }
  }

  if (!saved && failures.length && tab) {
    for (const item of failures.slice(0, 40)) {
      try {
        const blob = await cropVisibleImage(tab, item.image);
        await writeCapture(dayDir, blob, item.image, pageUrl, pageTitle, "visible-screenshot");
        saved += 1;
      } catch (error) {
        item.cropError = error;
      }
    }
  }

  if (!saved && failures.length) {
    const first = failures[0].cropError || failures[0].error;
    throw new Error(first.message || String(first));
  }

  return saved;
}

async function fetchImageBlob(url) {
  if (!url || url.startsWith("blob:")) throw new Error("无法直接保存 blob 图片");
  const response = await fetch(url, { credentials: "include", cache: "force-cache" });
  if (!response.ok) throw new Error(`图片下载失败 HTTP ${response.status}`);
  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) throw new Error(`不是图片响应：${blob.type || "unknown"}`);
  return blob;
}

async function writeCapture(dayDir, blob, image, pageUrl, pageTitle, method) {
  const stamp = timestamp();
  const ext = extensionFor(blob.type, image.imageUrl);
  const baseName = `${stamp}-${crypto.randomUUID().slice(0, 8)}`;
  const imageFile = await dayDir.getFileHandle(`${baseName}${ext}`, { create: true });
  const imageWritable = await imageFile.createWritable();
  await imageWritable.write(blob);
  await imageWritable.close();
}

async function cropVisibleImage(tab, image) {
  if (!image.rect) throw new Error("没有可裁切位置");
  const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  const bitmap = await createImageBitmap(dataUrlToBlob(screenshot));
  const scaleX = bitmap.width / Math.max(1, image.viewportWidth || tab.width || bitmap.width);
  const scaleY = bitmap.height / Math.max(1, image.viewportHeight || tab.height || bitmap.height);
  const crop = scaledRect(image.rect, bitmap.width, bitmap.height, scaleX, scaleY);
  if (crop.width < 80 || crop.height < 80) throw new Error("图片不在当前可见区域");
  const canvas = new OffscreenCanvas(crop.width, crop.height);
  canvas.getContext("2d").drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
  return await canvas.convertToBlob({ type: "image/png" });
}

function scanPageImages() {
  const seen = new Set();
  const images = [];
  const add = (url, img, alt = "") => {
    const imageUrl = normalize(url);
    if (!imageUrl || seen.has(imageUrl)) return;
    seen.add(imageUrl);
    const rect = img?.getBoundingClientRect?.();
    const width = img?.naturalWidth || img?.width || rect?.width || 0;
    const height = img?.naturalHeight || img?.height || rect?.height || 0;
    images.push({
      imageUrl,
      alt,
      width,
      height,
      rect: rect ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height } : null,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    });
  };

  for (const img of document.images) {
    const candidates = [
      img.currentSrc,
      img.src,
      img.getAttribute("src"),
      bestSrcset(img.getAttribute("srcset")),
      img.getAttribute("data-src"),
      img.getAttribute("data-original"),
      img.getAttribute("data-lazy-src")
    ];
    for (const url of candidates) add(url, img, img.alt || "");
  }

  for (const el of document.querySelectorAll("[style], [data-bg], [data-background], [data-cover], [data-image]")) {
    for (const attr of ["data-bg", "data-background", "data-cover", "data-image"]) add(el.getAttribute(attr), el);
    for (const url of cssUrls(getComputedStyle(el).backgroundImage)) add(url, el);
  }

  return images
    .filter((item) => item.width >= 120 || item.height >= 120 || !item.width && !item.height)
    .slice(0, 120);

  function normalize(url) {
    if (!url || typeof url !== "string") return "";
    const trimmed = url.trim();
    if (!trimmed || trimmed === "none" || trimmed.startsWith("blob:")) return "";
    try {
      return new URL(trimmed, location.href).href;
    } catch {
      return "";
    }
  }

  function bestSrcset(srcset) {
    if (!srcset) return "";
    return srcset.split(",")
      .map((item) => {
        const [url, size = ""] = item.trim().split(/\s+/, 2);
        return { url, score: Number((size.match(/\d+/) || [0])[0]) };
      })
      .sort((a, b) => b.score - a.score)[0]?.url || "";
  }

  function cssUrls(value) {
    if (!value || value === "none") return [];
    return Array.from(value.matchAll(/url\(["']?([^"')]+)["']?\)/g)).map((match) => match[1]);
  }
}

function scanHuabanMainImage() {
  const candidates = Array.from(document.images).map((img) => {
    const rect = img.getBoundingClientRect();
    const imageUrl = bestImageUrl(img);
    const width = img.naturalWidth || img.width || rect.width || 0;
    const height = img.naturalHeight || img.height || rect.height || 0;
    const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
    const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
    const area = visibleWidth * visibleHeight;
    const src = imageUrl.toLowerCase();
    const className = String(img.className || "").toLowerCase();
    const isNoise = src.includes("avatar") || src.includes("logo") || src.endsWith(".svg") || className.includes("avatar");
    const centerBias = rect.left < window.innerWidth * 0.82 && rect.right > window.innerWidth * 0.08;
    return {
      imageUrl,
      alt: img.alt || "",
      width,
      height,
      rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      score: isNoise || !centerBias ? 0 : area
    };
  }).filter((item) => item.imageUrl && item.score > 0 && (item.width >= 180 || item.height >= 180));

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] || null;

  function bestImageUrl(img) {
    const srcset = img.getAttribute("srcset") || "";
    const best = srcset.split(",").map((item) => {
      const [url, size = ""] = item.trim().split(/\s+/, 2);
      return { url, score: Number((size.match(/\d+/) || [0])[0]) };
    }).sort((a, b) => b.score - a.score)[0]?.url;
    return normalize(best || img.currentSrc || img.src || img.getAttribute("src") || "");
  }

  function normalize(url) {
    if (!url || typeof url !== "string" || url.startsWith("blob:")) return "";
    try {
      return new URL(url.trim(), location.href).href;
    } catch {
      return "";
    }
  }
}

async function withBusy(fn) {
  try {
    setDisabled(true);
    await fn();
  } catch (error) {
    statusEl.textContent = `失败：${error.message || error}`;
  } finally {
    setDisabled(false);
    await syncPendingButtons();
  }
}

function setDisabled(disabled) {
  chooseButton.disabled = disabled;
  huabanButton.disabled = disabled;
  collectButton.disabled = disabled;
  runPendingButton.disabled = disabled;
  pendingButton.disabled = disabled;
}

async function syncPendingButtons() {
  const { pendingImage, pendingAction } = await chrome.storage.session.get(["pendingImage", "pendingAction"]);
  pendingButton.disabled = !pendingImage;
  runPendingButton.disabled = !pendingAction;
}

function timestamp() {
  const now = new Date();
  return [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0")
  ].join("");
}

function extensionFor(type, url) {
  if (type === "image/jpeg") return ".jpg";
  if (type === "image/png") return ".png";
  if (type === "image/webp") return ".webp";
  if (type === "image/gif") return ".gif";
  const clean = (url || "").split(/[?#]/, 1)[0].toLowerCase();
  const match = clean.match(/\.(jpg|jpeg|png|webp|gif)$/);
  return match ? `.${match[1]}`.replace(".jpeg", ".jpg") : ".png";
}

function dataUrlToBlob(dataUrl) {
  const [header, encoded] = dataUrl.split(",", 2);
  const mime = (header.match(/^data:([^;]+)/) || [])[1] || "image/png";
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime });
}

function scaledRect(rect, maxWidth, maxHeight, scaleX, scaleY) {
  const x = Math.max(0, Math.round(rect.x * scaleX));
  const y = Math.max(0, Math.round(rect.y * scaleY));
  const right = Math.min(maxWidth, Math.round((rect.x + rect.width) * scaleX));
  const bottom = Math.min(maxHeight, Math.round((rect.y + rect.height) * scaleY));
  return { x, y, width: right - x, height: bottom - y };
}

async function verifyPermission(handle, request) {
  const options = { mode: "readwrite" };
  if (await handle.queryPermission(options) === "granted") return true;
  return request && await handle.requestPermission(options) === "granted";
}

async function saveHandle(handle) {
  const db = await openDb();
  await transaction(db, "readwrite", (store) => store.put(handle, HANDLE_KEY));
}

async function loadHandle() {
  const db = await openDb();
  return await transaction(db, "readonly", (store) => store.get(HANDLE_KEY));
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transaction(db, mode, callback) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = callback(tx.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
