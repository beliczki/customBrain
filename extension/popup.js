const DEFAULT_URL = 'https://brain.beliczki.hu';

async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['brainUrl', 'captureSecret'], (data) => {
      resolve({
        brainUrl: data.brainUrl || DEFAULT_URL,
        captureSecret: data.captureSecret || '',
      });
    });
  });
}

// Settings toggle
document.getElementById('toggleSettings').addEventListener('click', () => {
  document.getElementById('settingsPanel').classList.toggle('open');
});
document.getElementById('saveSettings').addEventListener('click', async () => {
  const brainUrl = document.getElementById('brainUrl').value.replace(/\/+$/, '');
  const captureSecret = document.getElementById('secret').value;
  chrome.storage.local.set({ brainUrl, captureSecret });
  document.getElementById('settingsPanel').classList.remove('open');
  setStatus('Settings saved', 'ok');
});

function setStatus(msg, type) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = 'status ' + (type || '');
}

// Extract page content via scripting API
function extractPage() {
  const title = document.title;
  const url = location.href;
  const ogDesc = document.querySelector('meta[property="og:description"]')?.content || '';
  const author = document.querySelector('meta[name="author"]')?.content
    || document.querySelector('[rel="author"]')?.textContent || '';

  const container = document.querySelector('article')
    || document.querySelector('[role="main"]')
    || document.querySelector('main')
    || document.body;

  const clone = container.cloneNode(true);
  clone.querySelectorAll('nav, footer, aside, script, style, header, [role="navigation"], .ad, .ads, .sidebar')
    .forEach((el) => el.remove());

  const text = clone.innerText.trim().substring(0, 15000);
  return { title, url, author, og_description: ogDesc, content: text };
}

async function init() {
  const settings = await getSettings();
  document.getElementById('brainUrl').value = settings.brainUrl;
  document.getElementById('secret').value = settings.captureSecret;

  // Inject content script and get page data
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let pageData;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPage,
    });
    pageData = results[0].result;
  } catch (err) {
    document.getElementById('pageTitle').textContent = tab.title || 'Unknown page';
    document.getElementById('pageUrl').textContent = tab.url || '';
    document.getElementById('content').value = `Could not extract: ${err.message}\n\nManually paste content here.`;
    document.getElementById('saveBtn').disabled = false;
    return;
  }

  document.getElementById('pageTitle').textContent = pageData.title;
  document.getElementById('pageUrl').textContent = pageData.url;

  const prefix = pageData.author ? `By: ${pageData.author}\n` : '';
  const desc = pageData.og_description ? `${pageData.og_description}\n\n` : '';
  document.getElementById('content').value =
    `${prefix}Source: ${pageData.url}\n${desc}${pageData.content}`;
  document.getElementById('saveBtn').disabled = false;

  // Search brain for related thoughts
  try {
    const searchUrl = `${settings.brainUrl}/search?q=${encodeURIComponent(pageData.title)}&limit=3`;
    const res = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${settings.captureSecret}` },
    });
    const data = await res.json();
    const container = document.getElementById('relatedItems');
    if (data.length > 0) {
      container.innerHTML = data
        .map((r) => `<div class="related-item">${r.title || r.text?.substring(0, 60) || 'untitled'}</div>`)
        .join('');
    } else {
      container.textContent = 'No related thoughts found';
    }
  } catch {
    document.getElementById('relatedItems').textContent = 'Could not search brain';
  }
}

// Save to brain
document.getElementById('saveBtn').addEventListener('click', async () => {
  const btn = document.getElementById('saveBtn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  const settings = await getSettings();
  const text = document.getElementById('content').value;

  try {
    const res = await fetch(`${settings.brainUrl}/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.captureSecret}`,
      },
      body: JSON.stringify({ text }),
    });

    const data = await res.json();
    if (data.ok) {
      setStatus('Saved to brain!', 'ok');
      btn.textContent = 'Saved!';
    } else {
      setStatus(data.error || 'Save failed', 'err');
      btn.textContent = 'Save to Brain';
      btn.disabled = false;
    }
  } catch (err) {
    setStatus(`Error: ${err.message}`, 'err');
    btn.textContent = 'Save to Brain';
    btn.disabled = false;
  }
});

init();
