/* globals validate, resources */
'use strict';

var app = {};
app.callbacks = {};
app.on = (id, callback) => {
  app.callbacks[id] = app.callbacks[id] || [];
  app.callbacks[id].push(callback);
};
app.emit = (id, value) => (app.callbacks[id] || []).forEach(c => c(value));

var cache = {};

var filters = Object.keys(resources)
  .map(host => Object.keys(resources[host]).map(path => host + path))
  .reduce((a, b) => a.concat(b))
  .map(url => '*://' + url + '*');

function flattenObject (ob) {
  let toReturn = {};

  for (let i in ob) {
    if (!ob.hasOwnProperty(i)) {
      continue;
    }
    if ((typeof ob[i]) === 'object') {
      let flatObject = flattenObject(ob[i]);
      for (let x in flatObject) {
        if (!flatObject.hasOwnProperty(x)) {
          continue;
        }
        toReturn[i + '' + x] = flatObject[x];
      }
    }
    else {
      toReturn[i] = ob[i];
    }
  }
  return toReturn;
}

chrome.webRequest.onBeforeRequest.addListener(d => {
  let {pathname, hostname} = new URL(d.url);
  let obj = resources[hostname];
  if (obj) {
    let list = flattenObject(obj);
    let matches = Object.keys(list).filter(str => {
      str = str.replace(/[-[\]{}()*+?.,\\^$|#\s\/]/g, '\\$&');
      str = str.replace(/vrsn/g, '(?:\\d{1,2}\\.){1,3}\\d{1,2}');
      return (new RegExp(str)).test(d.url);
    });
    if (matches.length) {
      let version = /(?:\d{1,2}\.){1,3}\d{1,2}/.exec(d.url)[0];
      let path = list[matches[0]].replace(/vrsn/g, version);

      if (validate(path)) {
        let redirectUrl = chrome.runtime.getURL('data/resources/' + path);

        if (cache[d.tabId]) {
          cache[d.tabId].push({
            hostname: hostname,
            pathname: pathname
          });
          app.emit('update-badge', d.tabId);
        }
        else {
          console.error('resource is redirected but no tab is found');
        }

        return {
          redirectUrl
        };
      }
      else {
        console.log('cannot find', d.url);
      }
    }
  }
  else {
    console.log('resources of', hostname, 'not found');
  }
}, {
    urls: filters,
    types: ['script', 'xmlhttprequest']
  },
  ['blocking']
);

// resetting toolbar badge
chrome.webRequest.onBeforeRequest.addListener(d => {
  if (cache[d.tabId]) {
    cache[d.tabId] = [];
    app.emit('update-badge', d.tabId);
  }
}, {
  urls: ['<all_urls>'],
  types: ['main_frame']
}, []);

// badge
chrome.tabs.query({}, tabs => tabs.forEach(t => cache[t.id] = []));
app.on('update-badge', (tabId) => {
  if (!cache[tabId]) {
    return;
  }
  chrome.browserAction.setBadgeText({
    tabId,
    text: (cache[tabId].length || '') + ''
  });
  let title = cache[tabId].map((o, i) => (i + 1) + '. ' + o.hostname + ' -> ' + o.pathname.split('/').pop()).join('\n');
  title = 'Local CDN' + (title ? '\n\n' + title : '');
  chrome.browserAction.setTitle({
    tabId,
    title
  });
});
chrome.tabs.onCreated.addListener((tab) => cache[tab.id] = []);
// cleanup
chrome.tabs.onRemoved.addListener((tabId) => delete cache[tabId]);
// FAQs
chrome.storage.local.get('version', (obj) => {
  let version = chrome.runtime.getManifest().version;
  if (obj.version !== version) {
    chrome.storage.local.set({version}, () => {
      chrome.tabs.create({
        url: 'http://add0n.com/local-cdn.html?version=' + version + '&type=' +
          (obj.version ? ('upgrade&p=' + obj.version) : 'install')
      });
    });
  }
});
