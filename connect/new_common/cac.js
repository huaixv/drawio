var CAC = {};

//Extend object with all CAC functions
CAC.applyCAC = function(obj)
{
	for (var fn in CAC)
	{
		obj[fn] = CAC[fn];
	}
};

CAC.$ = function(selector, elem)
{
	elem = elem || document;
	return elem.querySelector(selector);
};

CAC.$$ = function(selector, elem)
{
	elem = elem || document;
	return elem.querySelectorAll(selector);
};

CAC.getUrlParam = function(param, escape, url)
{
    try
    {
    	var url = url || window.location.search;

		var result = (new RegExp(param + '=([^&]*)')).exec(url);
		
		if (result != null && result.length > 0)
		{
			// decode URI with plus sign fix.
			return (escape) ? decodeURIComponent(result[1].replace(/\+/g, '%20')) : result[1];
		}
		
		return null;
    }
    catch (e)
    {
        return undefined;
    }
};

CAC.getMetaTag = function(name) 
{
	return document.getElementsByTagName('meta')[name].getAttribute('content');
};

CAC.getBaseUrl = function()
{
	var baseUrl = CAC.getUrlParam('xdm_e', true) + CAC.getUrlParam('cp', true);
	return baseUrl;
};

CAC.getDocDim = function() 
{
	var body = document.body,
    html = document.documentElement;

	var height = Math.max(body.scrollHeight, body.offsetHeight, 
                       html.clientHeight, html.scrollHeight, html.offsetHeight);

	var width = Math.max(body.scrollWidth, body.offsetWidth, 
            html.clientWidth, html.scrollWidth, html.offsetWidth);
	
	return {w: width, h: height};
};

CAC.htmlEntities = function(s, newline)
{
	s = String(s || '');
	
	s = s.replace(/&/g,'&amp;'); // 38 26
	s = s.replace(/"/g,'&quot;'); // 34 22
	s = s.replace(/\'/g,'&#39;'); // 39 27
	s = s.replace(/</g,'&lt;'); // 60 3C
	s = s.replace(/>/g,'&gt;'); // 62 3E

	if (newline == null || newline)
	{
		s = s.replace(/\n/g, '&#xa;');
	}
	
	return s;
};

CAC.getCurPageId = function(callback)
{
	AP.navigator.getLocation(function (data)
    {
    	if (data != null && data.context != null)
   		{
    		var draftPage = (data.target == 'contentcreate');
    		var pageId = data.context.contentId;
    		
    		callback(pageId, draftPage);
   		}
    	else
		{
    		alert('Unexpected Error: Cannot get content id or type.');
		}
    });
};

CAC.uploadCachedMxFile = function(fileContent, filename, success, error)
{
	CAC.uploadAttachment(fileContent, filename, 'application/vnd.jgraph.mxfile.cached', 'Diagram Viewer Cached file', success, error)
};

CAC.delOldCachedFiles = function(pageId, filename, timestamp)
{
	CAC.collectAllAttachments(pageId, function(atts)
	{
		for (var i = 0; i < atts.length; i++)
		{
			var cacheFilename = atts[i].title.match(/(\d+)_(.*)/);
			
			if (cacheFilename != null && cacheFilename[2] == filename && cacheFilename[1] != timestamp)
			{
				CAC.deleteAttachment(atts[i].id, CAC.noop, CAC.noop); //ignore deletion errors
			}
		}
	}, CAC.noop);//ignore deletion errors
};

CAC.uploadAttachment = function(fileContent, filename, fileType, comment, success, error)
{
	CAC.getCurPageId(function(pageId, draftPage)
	{
		var attFile = new Blob([fileContent], {type: fileType});
		attFile.name = filename;
		
		var reqData = {file: attFile, minorEdit: true, comment: comment};
		var draft = draftPage ? '?status=draft' : '';
		 
		AP.request({
			type: 'PUT',
			data: reqData,
			url:  '/rest/api/content/'+ pageId + '/child/attachment' + draft,
			contentType: 'multipart/form-data',
			success: success,
			error: error
		});
	});
};

CAC.collectAllAttachments = function(pageId, callback, error)
{
	var nextUrl = null, limit = 250, isPage = true;
	var attachments = [];
	
	function getChunck()
	{
		AP.request({
			type: 'GET',
			url: nextUrl? nextUrl : '/api/v2/' + (isPage? 'pages' : 'blogposts') + '/' + pageId + '/attachments?limit=' + limit,
			contentType: 'application/json;charset=UTF-8',
			success: function(resp) {
				var resp = JSON.parse(resp);
				
				for (var i = 0; i < resp.results.length; i++)
				{
					attachments.push({
						id: resp.results[i].id,
						title: resp.results[i].title
					});
				}
				
				//Support pageing
				if (resp._links && resp._links.next) 
				{
					nextUrl = resp._links.next.substring(5); // Remove initial /wiki
					getChunck();
				}
				else
				{
					callback(attachments);
				}
			},
			error: error
		});
	};
	
	CAC.getContentType_(pageId, function(isBlogpost)
	{
		isPage = !isBlogpost;
		getChunck();
	}, getChunck);
};

CAC.deleteAttachment = function(attId, success, error)
{
	AP.request({
		type: 'DELETE',
		url: '/api/v2/attachments/' + attId,
		contentType: 'application/json;charset=UTF-8',
		success: success,
		error: error
	});
};

CAC.uploadToJira = function(fileContent, issueId, filename, fileType, success, error)
{
	var attFile = new Blob([fileContent], {type: fileType});
	attFile.name = filename;
	
	var reqData = {file: attFile};

    AP.request(
    {
        url: '/rest/api/2/issue/' + issueId + '/attachments',
        type: 'POST',
		data: reqData,
        contentType: 'multipart/form-data',
        headers: {'X-Atlassian-Token': 'no-check'},
        success: success,
        error: error
    });	
};

CAC.getJiraAttList = function(issueId, success, error)
{
	AP.request({
		url: '/rest/api/2/issue/' + issueId + '?fields=attachment',
		type: 'GET',
		success: function(resp) 
		{
			var respObj = JSON.parse(resp);
			attDiagrams = [];
			
			for (var i = 0; i < respObj.fields.attachment.length; i++)
			{
				attDiagrams.push(respObj.fields.attachment[i]);	
			}

			success(attDiagrams);
		},
		error: error
	});	
};

CAC.noop = function(){};

CAC.importCsv = function(csv, callback, error)
{
	var editorUi = new HeadlessEditorUi();
	editorUi.handleError = error;
	
	editorUi.importCsv(csv, function()
	{
		var csvModel = editorUi.editor.getGraphXml();
		callback(csvModel, mxUtils.getXml(csvModel));
	});
};

CAC.getViewerAspect = function(viewer, aspectInfo)
{
	if (viewer.diagrams) //non-mxFiles doesn't have diagrams
	{
		var diagram = viewer.diagrams[viewer.currentPage];
		
		if (diagram != null)
		{
			var layerIds = [], layers = [], pageId = diagram.getAttribute('id');
		
			var model = viewer.graph.getModel();
			var childCount = model.getChildCount(model.root);
				
			// Get visible layers
			for (var i = 0; i < childCount; i++)
			{
				var layer = model.getChildAt(model.root, i);
				
				if (model.isVisible(layer))
				{
					layerIds.push(layer.id);
					layers.push(i);
				}
			}
			
			if (aspectInfo != null)
			{
				aspectInfo.pageId = pageId;
				aspectInfo.layerIds = layerIds;
				aspectInfo.layers = layers;
			}
			
			return pageId + ' ' + layerIds.join(' ');
		}
	}
	
	return null;
};

CAC.getState = function(redirectUri, callback, error)
{
	var req = new XMLHttpRequest();
	req.open('GET', redirectUri + '?getState=1');
	
	req.onreadystatechange = function()
	{
		if (this.readyState == 4)
		{
			if (this.status >= 200 && this.status <= 299)
			{
				callback(req.responseText);
			}
			else
			{
				error(this);
			}
		}
	};
	
	req.send();
};

// TODO Duplicat of AC.getContentType in connectUtils-1-4-8.js
CAC.getContentType_ = function(contentId, success, error)
{
	AP.request({
		type: 'POST',
		data: JSON.stringify({
			contentIds: [contentId]
		}),
		url:  '/api/v2/content/convert-ids-to-types',
		contentType: 'application/json;charset=UTF-8',
		success: function(resp)
		{
			resp = JSON.parse(resp);
			success(resp.results[contentId] != 'page');
		},
		error: error
	});
};

CAC.sha1 = function(str) 
{
	  //  discuss at: http://locutus.io/php/sha1/
	  // original by: Webtoolkit.info (http://www.webtoolkit.info/)
	  // improved by: Michael White (http://getsprink.com)
	  // improved by: Kevin van Zonneveld (http://kvz.io)
	  //    input by: Brett Zamir (http://brett-zamir.me)
	  //      note 1: Keep in mind that in accordance with PHP, the whole string is buffered and then
	  //      note 1: hashed. If available, we'd recommend using Node's native crypto modules directly
	  //      note 1: in a steaming fashion for faster and more efficient hashing
	  //   example 1: sha1('Kevin van Zonneveld')
	  //   returns 1: '54916d2e62f65b3afa6e192e6a601cdbe5cb5897'

	  var hash
	  try {
	    var crypto = require('crypto')
	    var sha1sum = crypto.createHash('sha1')
	    sha1sum.update(str)
	    hash = sha1sum.digest('hex')
	  } catch (e) {
	    hash = undefined
	  }

	  if (hash !== undefined) {
	    return hash
	  }

	  var _rotLeft = function (n, s) {
	    var t4 = (n << s) | (n >>> (32 - s))
	    return t4
	  }

	  var _cvtHex = function (val) {
	    var str = ''
	    var i
	    var v

	    for (i = 7; i >= 0; i--) {
	      v = (val >>> (i * 4)) & 0x0f
	      str += v.toString(16)
	    }
	    return str
	  }

	  var blockstart
	  var i, j
	  var W = new Array(80)
	  var H0 = 0x67452301
	  var H1 = 0xEFCDAB89
	  var H2 = 0x98BADCFE
	  var H3 = 0x10325476
	  var H4 = 0xC3D2E1F0
	  var A, B, C, D, E
	  var temp

	  // utf8_encode
	  str = unescape(encodeURIComponent(str))
	  var strLen = str.length

	  var wordArray = []
	  for (i = 0; i < strLen - 3; i += 4) {
	    j = str.charCodeAt(i) << 24 |
	      str.charCodeAt(i + 1) << 16 |
	      str.charCodeAt(i + 2) << 8 |
	      str.charCodeAt(i + 3)
	    wordArray.push(j)
	  }

	  switch (strLen % 4) {
	    case 0:
	      i = 0x080000000
	      break
	    case 1:
	      i = str.charCodeAt(strLen - 1) << 24 | 0x0800000
	      break
	    case 2:
	      i = str.charCodeAt(strLen - 2) << 24 | str.charCodeAt(strLen - 1) << 16 | 0x08000
	      break
	    case 3:
	      i = str.charCodeAt(strLen - 3) << 24 |
	        str.charCodeAt(strLen - 2) << 16 |
	        str.charCodeAt(strLen - 1) <<
	      8 | 0x80
	      break
	  }

	  wordArray.push(i)

	  while ((wordArray.length % 16) !== 14) {
	    wordArray.push(0)
	  }

	  wordArray.push(strLen >>> 29)
	  wordArray.push((strLen << 3) & 0x0ffffffff)

	  for (blockstart = 0; blockstart < wordArray.length; blockstart += 16) {
	    for (i = 0; i < 16; i++) {
	      W[i] = wordArray[blockstart + i]
	    }
	    for (i = 16; i <= 79; i++) {
	      W[i] = _rotLeft(W[i - 3] ^ W[i - 8] ^ W[i - 14] ^ W[i - 16], 1)
	    }

	    A = H0
	    B = H1
	    C = H2
	    D = H3
	    E = H4

	    for (i = 0; i <= 19; i++) {
	      temp = (_rotLeft(A, 5) + ((B & C) | (~B & D)) + E + W[i] + 0x5A827999) & 0x0ffffffff
	      E = D
	      D = C
	      C = _rotLeft(B, 30)
	      B = A
	      A = temp
	    }

	    for (i = 20; i <= 39; i++) {
	      temp = (_rotLeft(A, 5) + (B ^ C ^ D) + E + W[i] + 0x6ED9EBA1) & 0x0ffffffff
	      E = D
	      D = C
	      C = _rotLeft(B, 30)
	      B = A
	      A = temp
	    }

	    for (i = 40; i <= 59; i++) {
	      temp = (_rotLeft(A, 5) + ((B & C) | (B & D) | (C & D)) + E + W[i] + 0x8F1BBCDC) & 0x0ffffffff
	      E = D
	      D = C
	      C = _rotLeft(B, 30)
	      B = A
	      A = temp
	    }

	    for (i = 60; i <= 79; i++) {
	      temp = (_rotLeft(A, 5) + (B ^ C ^ D) + E + W[i] + 0xCA62C1D6) & 0x0ffffffff
	      E = D
	      D = C
	      C = _rotLeft(B, 30)
	      B = A
	      A = temp
	    }

	    H0 = (H0 + A) & 0x0ffffffff
	    H1 = (H1 + B) & 0x0ffffffff
	    H2 = (H2 + C) & 0x0ffffffff
	    H3 = (H3 + D) & 0x0ffffffff
	    H4 = (H4 + E) & 0x0ffffffff
	  }

	  temp = _cvtHex(H0) + _cvtHex(H1) + _cvtHex(H2) + _cvtHex(H3) + _cvtHex(H4)
	  return temp.toLowerCase()
};

//TODO Use this functions in all similar places (admin pages and office add-in), including Conf AC
//We need language translation for error messages mainly which are not needed immediately
CAC.initI18nAsync = function(lang, callback, direct, resourcePrefix)
{
	RESOURCE_BASE = (resourcePrefix || '') + '/resources/dia';
	mxLanguage = lang;
	
	var script = document.createElement('script');
	
	function loadResources()
	{
		mxResources.loadDefaultBundle = false;
		var bundle = mxResources.getDefaultBundle(RESOURCE_BASE, lang) ||
			mxResources.getSpecialBundle(RESOURCE_BASE, lang);
		
		mxUtils.getAll([bundle], function(xhr)
		{
			// Adds bundle text to resources
			mxResources.parse(xhr[0].getText());
			
			if (callback) 
			{
				callback();
			}
		});
	};
	
	if (direct)
	{
		loadResources();
	}
	else
	{
		script.onload = loadResources;
		script.src = '/js/viewer-static.min.js';
		document.getElementsByTagName('head')[0].appendChild(script);		
	}
};

//TODO Use this functions in all similar places (admin pages and office add-in), including Conf AC
CAC.applyTranslation = function()
{
	//HTML elements localization
	var i18nElems = CAC.$$('*[data-i18n]'); //get all elements having data-i18n attribute, should be fine given a small html file
	
	for (var i = 0; i < i18nElems.length; i++)
	{
		var i18nKey = i18nElems[i].getAttribute('data-i18n');
		i18nElems[i].innerHTML = CAC.htmlEntities(mxResources.get(i18nKey, null, i18nElems[i].innerHTML));
	}
	
	//Title
	var i18nTitleElems = CAC.$$('*[data-i18n-title]');
	
	for (var i = 0; i < i18nTitleElems.length; i++)
	{
		var i18nKey = i18nTitleElems[i].getAttribute('data-i18n-title');
		i18nTitleElems[i].setAttribute('title', CAC.htmlEntities(mxResources.get(i18nKey, null, i18nTitleElems[i].getAttribute('title'))));
	}
	
	//Placeholders
	var i18nPlaceholderElems = CAC.$$('*[data-i18n-placeholder]');
	
	for (var i = 0; i < i18nPlaceholderElems.length; i++)
	{
		var i18nKey = i18nPlaceholderElems[i].getAttribute('data-i18n-placeholder');
		i18nPlaceholderElems[i].setAttribute('placeholder', CAC.htmlEntities(mxResources.get(i18nKey, null, i18nPlaceholderElems[i].getAttribute('placeholder'))));
	}
};

//Safe guard in case mxResources is not loaded
if (typeof window.mxResources === 'undefined')
{
	//define mxResources such that it is available and no errors are thrown
	window.mxResources = {
		get: function(key, params, def)
		{
			return (def || '').replace('{1}', params? (params[0] || '') : ''); //Simple replacement which covers most cases 
		}
	};
}