const byId = id => document.getElementById(id);
const locateButton = byId('locate');
const compassButton = byId('compass');
const copyButton = byId('copy');
const locationHelp = byId('location-help');
const orientation = window.DeviceOrientationEvent;
const canvas = byId('dial');
const ctx = canvas.getContext('2d');
const directions = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
const geoOptions = { enableHighAccuracy: true, maximumAge: 0, timeout: 16000 };
let watch = null;
let latest = null;
let staleTimer;
let compassStarted = false;
let compassNeedsPermission = typeof orientation?.requestPermission === 'function';
let compassTimer;

function setText(id, text) {
  const element = byId(id);
  if (element.textContent !== text) element.textContent = text;
}
function format(value, decimals, unit) {
  return Number.isFinite(value) ? value.toFixed(decimals) + unit : '—';
}
function direction(degrees) {
  return directions[Math.round(degrees / 45) % directions.length];
}
function roundedBearing(degrees) {
  return Math.round(degrees) % 360 + '°';
}
function drawDial(degrees) {
  if (!ctx) return;
  ctx.clearRect(0, 0, 600, 600);
  ctx.save();
  ctx.translate(300, 300);
  ctx.strokeStyle = '#425979';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, 235, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 156, 0, 2 * Math.PI);
  ctx.stroke();

  for (let tick = 0; tick < 72; tick += 1) {
    ctx.save();
    ctx.rotate((tick * 5 - (degrees ?? 0)) * Math.PI / 180);
    const major = tick % 6 === 0;
    ctx.lineWidth = major ? 2.6 : 1.3;
    ctx.strokeStyle = major ? '#afc5e5' : '#597396';
    ctx.beginPath();
    ctx.moveTo(0, -248);
    ctx.lineTo(0, major ? -268 : -257);
    ctx.stroke();
    ctx.restore();
  }
  for (let cardinal = 0; cardinal < 4; cardinal += 1) {
    const angle = (cardinal * 90 - (degrees ?? 0)) * Math.PI / 180;
    ctx.font = '600 29px -apple-system, PingFang SC, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = cardinal === 0 ? '#8fbdff' : '#d9e6f9';
    ctx.fillText(directions[cardinal * 2], 196 * Math.sin(angle), -196 * Math.cos(angle));
  }
  ctx.fillStyle = degrees === null ? '#94acd0' : '#75b8ff';
  ctx.beginPath();
  ctx.moveTo(-10, -288);
  ctx.lineTo(10, -288);
  ctx.lineTo(0, -268);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function expireLocation() {
  if (watch === null) return;
  setText('location-mode', '上次读数');
  setText('location-status', '暂时没有收到新定位，以下保留上次读数。');
}
function showLocation(position) {
  const c = position.coords;
  if (!Number.isFinite(c.latitude) || !Number.isFinite(c.longitude)) return;
  latest = position;
  locationHelp.hidden = true;
  setText('latitude', format(c.latitude, 6, '°'));
  setText('longitude', format(c.longitude, 6, '°'));
  setText('altitude', format(c.altitude, 1, ' m'));
  setText('accuracy', format(c.accuracy, 0, ' m'));
  setText('altitudeAccuracy', format(c.altitudeAccuracy, 0, ' m'));
  setText('speed', format(Number.isFinite(c.speed) ? c.speed * 3.6 : null, 1, ' km/h'));
  const hasCourse = Number.isFinite(c.heading) && c.heading >= 0 && c.heading < 360 && c.speed !== 0;
  setText('course', hasCourse ? roundedBearing(c.heading) + ' ' + direction(c.heading) : '—');
  setText('time', new Date(position.timestamp).toLocaleTimeString('zh-CN', { hour12: false }));
  setText('location-mode', '定位中');
  setText('location-status', '持续更新中。— 表示设备未提供读数。');
  copyButton.disabled = false;
  clearTimeout(staleTimer);
  const remaining = 45000 - (Date.now() - position.timestamp);
  if (remaining > 0) staleTimer = setTimeout(expireLocation, remaining);
  else expireLocation();
}

function stopLocation(mode, message) {
  if (watch !== null) navigator.geolocation.clearWatch(watch);
  watch = null;
  clearTimeout(staleTimer);
  locateButton.textContent = '开始定位';
  setText('location-mode', mode);
  setText('location-status', message);
}
function locationError(error) {
  if (error.code === 1) {
    stopLocation('未授权', '当前浏览器未允许访问位置。修改权限后，点「开始定位」重试。');
    locationHelp.hidden = false;
    locationHelp.open = true;
    return;
  }
  clearTimeout(staleTimer);
  setText('location-mode', latest ? '上次读数' : '等待信号');
  setText('location-status', error.code === 3
    ? '定位超时，正在等待新读数。到开阔处可能更容易定位。'
    : '目前无法取得位置，正在等待新读数。');
}
locateButton.addEventListener('click', () => {
  if (watch !== null) {
    stopLocation('已停止', latest ? '保留上次读数，点「开始定位」可继续。' : '点「开始定位」可重试。');
    return;
  }
  if (!window.isSecureContext || !navigator.geolocation) {
    setText('location-status', '此页面无法使用定位，请在 Safari 中打开 HTTPS 版本。');
    return;
  }
  setText('location-mode', latest ? '上次读数' : '正在定位');
  locationHelp.hidden = true;
  setText('location-status', '正在请求位置，请允许定位权限。');
  locateButton.textContent = '停止定位';
  watch = navigator.geolocation.watchPosition(showLocation, locationError, geoOptions);
});

copyButton.addEventListener('click', async () => {
  if (!latest) return;
  const { latitude, longitude } = latest.coords;
  const text = latitude.toFixed(6) + ', ' + longitude.toFixed(6);
  try {
    await navigator.clipboard.writeText(text);
    copyButton.textContent = '已复制';
    setTimeout(() => { copyButton.textContent = '复制坐标'; }, 1500);
  } catch {
    window.prompt('复制纬度、经度', text);
  }
});

function noHeading() {
  drawDial(null);
  setText('bearing', '—');
  setText('direction', '手机朝向');
  setText('compass-mode', '等待读数');
  setText('compass-status', '尚未收到有效朝向。将手机平放，或检查 Safari 的运动与方向权限。');
}
function handleOrientation(event) {
  const degrees = event.webkitCompassHeading;
  const accuracy = event.webkitCompassAccuracy;
  if (!Number.isFinite(degrees) || degrees < 0 || degrees > 360) return;
  clearTimeout(compassTimer);
  if (Number.isFinite(accuracy) && accuracy < 0) {
    noHeading();
    return;
  }
  compassNeedsPermission = false;
  compassButton.textContent = '停止指南针';
  const heading = degrees % 360;
  drawDial(heading);
  setText('bearing', roundedBearing(heading));
  setText('direction', direction(heading));
  setText('compass-mode', '手机朝向');
  setText('compass-status', Number.isFinite(accuracy) && accuracy > 25
    ? '指南针精度较低，请远离磁性物件。'
    : '手机顶部指向。移动方向另见定位栏。');
}
function startCompass() {
  window.addEventListener('deviceorientation', handleOrientation);
  compassStarted = true;
  clearTimeout(compassTimer);
  if (compassNeedsPermission) {
    compassButton.textContent = '允许指南针';
    setText('compass-mode', '等待读数');
    setText('compass-status', '正在尝试读取朝向。首次使用时，请允许访问运动与方向。');
  } else {
    compassButton.textContent = '停止指南针';
    setText('compass-mode', '等待读数');
    setText('compass-status', '将手机平放，等待读取朝向。');
    compassTimer = setTimeout(noHeading, 4500);
  }
}

compassButton.addEventListener('click', async () => {
  if (compassStarted && !compassNeedsPermission) {
    window.removeEventListener('deviceorientation', handleOrientation);
    clearTimeout(compassTimer);
    compassStarted = false;
    drawDial(null);
    setText('bearing', '—');
    setText('direction', '手机朝向');
    setText('compass-mode', '已停止');
    setText('compass-status', '将手机平放，读取机身顶部指向。');
    compassButton.textContent = '启用指南针';
    return;
  }

  compassButton.disabled = true;
  try {
    if (compassNeedsPermission) {
      const permission = await orientation.requestPermission();
      if (permission !== 'granted') throw new Error('permission denied');
      compassNeedsPermission = false;
    }
    startCompass();
  } catch {
    setText('compass-mode', '未授权');
    setText('compass-status', '未取得运动与方向权限。请在 iPhone Safari 打开本页，再试一次。');
  } finally {
    compassButton.disabled = false;
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (compassStarted && !compassNeedsPermission) {
      clearTimeout(compassTimer);
      noHeading();
    }
    return;
  }
  if (latest && Date.now() - latest.timestamp >= 45000) expireLocation();
});

async function prepareOffline() {
  if (!window.isSecureContext || !('serviceWorker' in navigator)) {
    setText('cache-status', '离线缓存不可用');
    return;
  }
  try {
    await navigator.serviceWorker.register('./sw.js');
    const notice = setTimeout(() => setText('cache-status', '缓存未就绪 · 联网重试'), 12000);
    await navigator.serviceWorker.ready;
    clearTimeout(notice);
    setText('cache-status', '离线缓存就绪');
  } catch {
    setText('cache-status', '缓存失败 · 联网重试');
  }
}

drawDial(null);
if (window.isSecureContext && orientation) {
  startCompass();
} else {
  compassButton.disabled = true;
  setText('compass-mode', '不可用');
  setText('compass-status', '当前环境无法读取朝向，请用 iPhone Safari 打开 HTTPS 页面。');
}
prepareOffline();
if (navigator.standalone || matchMedia('(display-mode: standalone)').matches) {
  byId('install').hidden = true;
}
