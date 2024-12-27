// Sets base path for mxgraph library
if (typeof window.mxBasePath === 'undefined')
{
	window.mxBasePath = '/mxgraph';
}

// Sets absolute path for proxy
window.PROXY_URL = window.PROXY_URL || '/proxy';
window.DRAWIO_SERVER_URL = window.location.origin + '/';

// Renamed from ac.js. This is the version used for release 1.4.8-AC onwards
var AC = {};

AC.getUrlParam = function(param, escape, url){
    try{
    	var url = url || window.location.search;
        var regex = new RegExp(param + '=([^&]+)'),
        data = regex.exec(url)[1];
        // decode URI with plus sign fix.
        return (escape) ? window.decodeURIComponent(data.replace(/\+/g, '%20')) : data;
    } catch (e){
        return undefined;
    }
};

// Determine whether whiteboard app
AC.isWhiteboardApp = (AC.getUrlParam('wbapp') == '1');

if (AC.isWhiteboardApp)
{
	AC.appKey = 'com.jgraph.confluence.plugins.whiteboards';
	AC.macroType = 'com.jgraph.confluence.plugins.whiteboards:drawio-whiteboard';
	AC.findMacrosRegEx = new RegExp('\\<ac\\:structured\\-macro[^\\>]+?(?=ac\\:name\\=)ac\\:name\\=\\"jgraph-whiteboard\\".*?(?=\\<\\/ac\\:structured\\-macro\\>)', 'g'); //Not used in whiteboard
	AC.findEmbedMacrosRegEx = new RegExp('\\<ac\\:structured\\-macro[^\\>]+?(?=ac\\:name\\=)ac\\:name\\=\\"inc\\-jgraph\\-whiteboard\\".*?(?=\\<\\/ac\\:structured\\-macro\\>)', 'g');
	AC.findSketchMacrosRegEx = new RegExp('\\<ac\\:structured\\-macro[^\\>]+?(?=ac\\:name\\=)ac\\:name\\=\\"jgraph-whiteboard\\".*?(?=\\<\\/ac\\:structured\\-macro\\>)', 'g');
}
else
{
	AC.appKey = 'com.mxgraph.confluence.plugins.diagramly';
	AC.macroType = 'com.mxgraph.confluence.plugins.diagramly:drawio-diagram';
	AC.findMacrosRegEx = new RegExp('\\<ac\\:structured\\-macro[^\\>]+?(?=ac\\:name\\=)ac\\:name\\=\\"drawio\\".*?(?=\\<\\/ac\\:structured\\-macro\\>)', 'g');
	AC.findEmbedMacrosRegEx = new RegExp('\\<ac\\:structured\\-macro[^\\>]+?(?=ac\\:name\\=)ac\\:name\\=\\"inc\\-drawio\\".*?(?=\\<\\/ac\\:structured\\-macro\\>)', 'g');
	AC.findSketchMacrosRegEx = new RegExp('\\<ac\\:structured\\-macro[^\\>]+?(?=ac\\:name\\=)ac\\:name\\=\\"drawio-sketch\\".*?(?=\\<\\/ac\\:structured\\-macro\\>)', 'g');
}

AC.autosaveTimeout = 10000;
AC.draftExtension = '.tmp';
AC.draftPrefix = '~';
AC.timeout = 25000;

//Allow saving multiple times
//Important: Don't change this as it will break real-time collab! TODO Remove it
AC.autoExit = true;

//This flag MUST be true for correct operation TODO Remove it
AC.draftEnabled = true;

AC.customContentEditMode = false;
AC.directEditMode = false;

AC.VERSION = '1.4.8'; //TODO Get the version
AC.draftsToKeep = 10;

AC.COLLAB_PROP = 'ac:custom-content:collab';
AC.COLLAB_LOCK_PROP = 'ac:custom-content:collabLock';
AC.MACRO_EDITS_PROP = 'pendingDrawioMacroEdits';
AC.LOCK_TS_NAME = '<:LOCK_TS?>';

AC.maxRetries = 5;
AC.coolOff = 1000;

AC.CONFIG_FILENAME = 'configuration.json';

AC.hasLocalStorage = false;
	
//When 3rd party coookies are disabled, localStorage is not accessable
try
{
	AC.hasLocalStorage = typeof window.localStorage !== 'undefined';
}
catch(e){}

//TODO There are some global variable and also local variables (used as global) in the huge init function. Remove as much as possible then move the remaining to the state  
//Holds the currently edited file info
AC.state = {};
// Cache content types for each request to avoid multiple requests
AC.contentTypeCache = {};


AC.attachmentFullUrl = /\/download\/attachments\/(\d+)(.*)/;

AC.checkConfLicense = function(license, xdm_e, callback)
{
	//Exclude dev domain
	if (location.host == 'test.draw.io')
	{
		callback(true);
		return;
	}
	
	var licenseValid = true;
	
	if (license != null && xdm_e != null)
	{
		var hostParse = document.createElement('a');
		hostParse.href = xdm_e;
		var hostname = hostParse.hostname;
		
		if (hostname != null)
		{
			var xhr = new XMLHttpRequest();
	
			xhr.onreadystatechange = function()
			{
			    if (xhr.readyState == XMLHttpRequest.DONE && license == 'none')
			    {
					if (xhr.status >= 200 && xhr.status <= 299)
					{
				        var resp = xhr.responseText;
		
						try
						{
							var lic = JSON.parse(resp);
							
							if (lic.atlasCloudLic == null || lic.atlasCloudLic == 'blocked')
							{
								licenseValid = false;
							}
						}
						catch (e)
						{
							licenseValid = false;
						}
					}
					
					callback(licenseValid);
			    }
			};
	
			xhr.open('POST', '/license?domain=' + hostname + '&confLicense=' + license, true);
			xhr.send(null);

			// Immidiately return if licnese is valid, the above call logs the license
			if (license != 'none')
			{
				callback(licenseValid);
			}
		}
		else
		{
			callback(licenseValid);
		}
	}
	else
	{
		callback(licenseValid);
	}
};

AC.checkOtherLicense = function(xdm_e)
{
	if (AC.getUrlParam('wbapp') == '1' ||
		// Prevent auth dialog on Safari
		/Apple Computer, Inc/.test(navigator.vendor))
	{
		return;
	}

	var checkCount = 0, gLic, lLic;
	
	function logLic()
	{
		checkCount++;
		
		if (checkCount == 2)
		{
			AP.request({
				type: 'PUT',
			    url: '/rest/atlassian-connect/1/addons/' + AC.appKey + '/properties/lastLicCheck',
			    contentType: 'application/json;charset=UTF-8',
				data: Date.now()
			});
			
			var hostParse = document.createElement('a');
			hostParse.href = xdm_e;
			var hostname = hostParse.hostname;
			
			function getLicInfo(lic)
			{
				return {installed: lic != null, licensed: lic != null && lic.license != null? (lic.license.evaluation? 'eval' : (lic.license.active? 'active' : 'unlicensed')) : 'unlicensed'};
			};
			
			var xhr = new XMLHttpRequest();
			xhr.open('POST', '/license?others=1&domain=' + hostname + '&info=' + encodeURIComponent(JSON.stringify({
				gliffy: getLicInfo(gLic),
				lucid: getLicInfo(lLic)
			})), true);
			xhr.send(null);
		}
	};
	
	function checkLicense()
	{
		AP.request({
			type: 'GET',
		    url: '/rest/atlassian-connect/1/addons/com.gliffy.integration.confluence',
		    contentType: 'application/json;charset=UTF-8',
		    success: function (resp) 
		    {
		        gLic = JSON.parse(resp);
				logLic();
		    },
			error : logLic
		});
		
		AP.request({
			type: 'GET',
		    url: '/rest/atlassian-connect/1/addons/com.lucidchart.confluence.plugins.lucid-confluence',
		    contentType: 'application/json;charset=UTF-8',
		    success: function (resp) 
		    {
		        lLic = JSON.parse(resp);
				logLic();
		    },
			error : logLic
		});
	}
	
	AP.request({
		type: 'GET',
	    url: '/rest/atlassian-connect/1/addons/' + AC.appKey + '/properties/lastLicCheck',
	    contentType: 'application/json;charset=UTF-8',
	    success: function (resp) 
	    {
	        resp = JSON.parse(resp);
			
			if (Date.now() - resp.value > 30 * 24 * 60 * 60 * 1000) //One month
			{
				checkLicense();
			}
	    },
		error : checkLicense
	});	
};

AC.logError = function(message, url, linenumber, colno, err, severity, noStack)
{
	if (message != null)
	{
		err = (err != null) ? err : new Error(message);
		var stack = (err.stack != null) ? err.stack : new Error().stack;
		severity = (severity != null) ? severity : ((message.indexOf('NetworkError') < 0 &&
			message.indexOf('SecurityError') < 0 && message.indexOf('NS_ERROR_FAILURE') < 0 &&
			message.indexOf('out of memory') < 0) ? 'SEVERE' : 'CONFIG');
		
		try
		{
			if (window.location.hostname == 'test.draw.io')
			{
				try
				{
					if (window.console != null)
					{
						console.error(severity, message, url, linenumber, colno, err);
					}
				}
				catch (e)
				{
					// ignore
				}
			}
			else if (message != AC.lastErrorMessage && message.indexOf('extension:') < 0 &&
				message.indexOf('ResizeObserver loop completed with undelivered notifications') < 0 &&
				stack.indexOf('extension:') < 0 && stack.indexOf('<anonymous>:') < 0 &&
				stack.indexOf('/math/es5/') < 0)
			{
				AC.lastErrorMessage = message;
				
				var img = new Image();
				img.src = 'https://log.draw.io/log?severity=' + severity + '&AC-v=' + encodeURIComponent(AC.VERSION) +
					((typeof window.EditorUi !== 'undefined') ? '&v=' + encodeURIComponent(EditorUi.VERSION) : '') +
					'&msg=clientError:' + (AC.isWhiteboardApp? 'WBC:' : '') + encodeURIComponent(message) + ':url:' + encodeURIComponent(window.location.href) +
					':lnum:' + encodeURIComponent(linenumber) + ((colno != null) ? ':colno:' + encodeURIComponent(colno) : '') +
					((!noStack && stack != null) ? '&stack=' + encodeURIComponent(stack) : '');
			}
		}
		catch (err)
		{
			// do nothing
		}
	}
};

AC.logInfo = function(message, url)
{
	try
	{
		var img = new Image();
		img.src = 'https://log.draw.io/log?severity=INFO' +
			((typeof window.EditorUi !== 'undefined') ? '&v=' + encodeURIComponent(EditorUi.VERSION) : '') +
			'&msg=' + encodeURIComponent(message) + ':url:' + encodeURIComponent(url);
	}
	catch (err)
	{
		// do nothing
	}
};

AC.DEBUG = false;

AC.log = function()
{
	try
	{
		if (window.console != null && AC.DEBUG)
		{
			var args = [new Date().toISOString(), 'AC LOG'];
			
			for (var i = 0; i < arguments.length; i++)
			{
				args.push(arguments[i]);
			}
			
			console.log.apply(console, args);
		}
	}
	catch (e)
	{
		// ignore
	}
};

AC.ALERT = false;

AC.alert = function(msg)
{
	if (AC.ALERT)
	{
		alert(msg);
	}
};

(function() {
	AC.macroParams = ['diagramName', 'contentId', 'contentVer', 'revision', 'width', 'height', 'tempPreview', 'zoom', 'lbox', 
			'diagramDisplayName', 'tbstyle', 'links', 'simple', 'hiResPreview', 'inComment', 'aspect', 'pageId', 'baseUrl',
			//inc-drawio macro specific params
			'diagramUrl', 'includedDiagram', 'aspectHash', 'imgPageId', 'attVer', 'custContentId',
			'pCenter',
			//Server macro parameters
			'border', 'viewerToolbar', 'simpleViewer', 'diagramWidth',
			//Newly added macro paramters
			//drawio macro
			'templateUrl', 'tmpBuiltIn', 'tempLibs',
			//inc-drawio macro
			'csvFileUrl', 'service', 'sFileId', 'odriveId', 'isTemplate',
			//recently added
			'isUpload', 'GHOwner', 'GHRepository', 'GHBranch', 'GHIsPrivate',
			'mVer', 'pageInfo'
	];
	AC.findMacroParamRegEx = {};
	
	for (var i = 0; i < AC.macroParams.length; i++)
	{
		var p = AC.macroParams[i];
		AC.findMacroParamRegEx[p] = new RegExp('\\<ac\\:parameter\\s+ac\\:name\\=\\"'+ p +'\\"\\s*\\>' + 
				(p == 'pageInfo'? '(((?!\\<\\/).)+)' : '([^\\<]+)')); // -ve lookahead is slower, use it with pageinfo only
	}
	
	AC.macroParams.push('macroId');
	AC.findMacroParamRegEx['macroId'] = new RegExp('ac\\:macro-id\\=\\"([^\\"]+)');
	AC.findMacroParamRegEx['pageInfo:SpaceKey'] = new RegExp('ri\\:space-key\\=\\"([^\\"]+)');
	AC.findMacroParamRegEx['pageInfo:PageTitle'] = new RegExp('ri\\:content-title\\=\\"([^\\"]+)');
})();

AC.getSpaceKey = function(url)
{
    try{
        var url = url || window.location.href;
        var regex = new RegExp(/\/(spaces|space)\/([^\/]+)/);
        return decodeURIComponent(regex.exec(url)[2]);
    } catch (e){
        return undefined;
    }
};

AC.getMetaTag = function(name) {
	return document.getElementsByTagName('meta')[name].getAttribute('content');
}

AC.getBaseUrl = function()
{
	var baseUrl = AC.getUrlParam('xdm_e', true) + AC.getUrlParam('cp', true);
	//Ensure baseUrl belongs to attlasian (*.jira.com and *.atlassian.net)
	//Since we add cp to xdm_e, we had to ensure that there is a slash after the domain. Since if xdm_e is ok, cp can corrupt is such as cp = '.fakedomain.com' such that baseUrl is atlassian.net.fakedomain.com

	//2024-07-16 DB. Had to disable due to conf cloud custom domains.
	//if (/^https:\/\/([^\.])+\.jira\.com\//.test(baseUrl + '/') || /^https:\/\/([^\.])+\.atlassian\.net\//.test(baseUrl + '/')) 
	//{
		return baseUrl;
	//}
	//throw 'Invalid baseUrl!';
};

AC.getSiteUrl = function()
{
	var siteUrl = AC.getUrlParam('xdm_e', true);
	return siteUrl;
};

//Code from: https://stackoverflow.com/questions/16245767/creating-a-blob-from-a-base64-string-in-javascript
AC.b64toBlob = function(b64Data, contentType, sliceSize, isByteCharacters) 
{
	  contentType = contentType || '';
	  sliceSize = sliceSize || 512;

	  var byteCharacters = isByteCharacters? b64Data : atob(b64Data);
	  var byteArrays = [];

	  for (var offset = 0; offset < byteCharacters.length; offset += sliceSize) {
	    var slice = byteCharacters.slice(offset, offset + sliceSize);

	    var byteNumbers = new Array(slice.length);
	    for (var i = 0; i < slice.length; i++) {
	      byteNumbers[i] = slice.charCodeAt(i);
	    }

	    var byteArray = new Uint8Array(byteNumbers);

	    byteArrays.push(byteArray);
	  }

	  var blob = new Blob(byteArrays, {type: contentType});
	  return blob;
};

//We need language translation for error messages mainly which are not needed immediately
//TODO Duplicate with CAC one, Use CAC one instead
AC.initI18nAsync = function(lang, callback, direct, resourcePrefix)
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

//TODO Use this functions in all similar places (admin pages and office add-in)
AC.applyTranslation = function()
{
	//HTML elements localization
	var i18nElems = document.querySelectorAll('*[data-i18n]'); //get all elements having data-i18n attribute, should be fine given a small html file
	
	for (var i = 0; i < i18nElems.length; i++)
	{
		var i18nKey = i18nElems[i].getAttribute('data-i18n');
		i18nElems[i].innerHTML = AC.htmlEntities(mxResources.get(i18nKey, null, i18nElems[i].innerHTML));
	}
	
	//Title
	var i18nTitleElems = document.querySelectorAll('*[data-i18n-title]');
	
	for (var i = 0; i < i18nTitleElems.length; i++)
	{
		var i18nKey = i18nTitleElems[i].getAttribute('data-i18n-title');
		i18nTitleElems[i].setAttribute('title', AC.htmlEntities(mxResources.get(i18nKey, null, i18nTitleElems[i].getAttribute('title'))));
	}
	
	//Placeholders
	var i18nPlaceholderElems = document.querySelectorAll('*[data-i18n-placeholder]');
	
	for (var i = 0; i < i18nPlaceholderElems.length; i++)
	{
		var i18nKey = i18nPlaceholderElems[i].getAttribute('data-i18n-placeholder');
		i18nPlaceholderElems[i].setAttribute('placeholder', AC.htmlEntities(mxResources.get(i18nKey, null, i18nPlaceholderElems[i].getAttribute('placeholder'))));
	}
};

AC.getAndApplyTranslation = function(callback, direct)
{
	AP.user.getLocale(function(locale)
	{
		if (locale != null)
		{
			var dash = locale.indexOf('_');
			
			if (dash >= 0)
			{
				locale = locale.substring(0, dash);
			}
			
			AC.initI18nAsync(locale, function()
			{
				AC.applyTranslation();
				callback(locale);
			}, direct);
		}
		else
		{
			callback(locale);
		}
	});
};

//AP.flag has a bug and stopped working, we'll use alert until it is fixed
//		https://ecosystem.atlassian.net/browse/ACJS-1052
AC.showNotification = function(notifConfig, closeDlg, closeData)
{
	AP.flag.create(notifConfig);
	alert(notifConfig.title + ': ' + notifConfig.body);

	if (closeDlg)
	{
		AP.dialog.close(closeData);
	}
};

AC.contentTypeFnWrapper = function(fn, idParamIndex, errFnIndex)
{
	// Fetch contentType before proceeding
	function wrappedFn()
	{
		var contentId = arguments[idParamIndex || 0];

		if (AC.contentTypeCache[contentId] != null)
		{
			fn.apply(this, arguments);
		}
		else
		{
			var this_ = this;
			var fnArgs = arguments;

			AC.getContentType(contentId,
				function(isBlogpost, type)
				{
					AC.contentTypeCache[contentId] = {isBP: isBlogpost, type: type};
					fn.apply(this_, fnArgs);
				}, function()
				{
					var errFn = fnArgs[errFnIndex || (fnArgs.length - 1)];

					if (typeof errFn === 'function')
					{
						errFn.apply(this_, arguments);
					}
				});
		}
	};
	
	return wrappedFn;
};

AC.initAsync = function(baseUrl, contentId, initMacroData, configObj, lang, isSketch, refreshConfig, darkMode, macroId, directEdit, openingPageId)
{
	if (configObj != null && configObj.viewerTimeout != null)
	{
		AC.timeout = configObj.viewerTimeout;
	}

	AC.isSketch = isSketch;
	AC.customContentEditMode = contentId != null;
	AC.directEditMode = directEdit;
	var contentVer = initMacroData != null? initMacroData.contentVer : null;
	
	var link = document.createElement('a');
	link.href = location.href;
	link.href = link.href; //to have 'host' populated under IE
	var hostUrl = link.protocol + '//' + link.hostname;
	var site = AC.getSiteUrl();
	var license = AC.getUrlParam('lic', false);
	
	var user = null;
	
	AP.user.getCurrentUser(function(atlUser) 
	{
		user = atlUser.atlassianAccountId;
	});
		
	if (lang != null)
	{
		var dash = lang.indexOf('_');
		
		if (dash >= 0)
		{
			lang = lang.substring(0, dash);
		}
		
		AC.initI18nAsync(lang);
	}
	
	var ui = isSketch? 'sketch' : 'kennedy';
	var plugins = 'ac148;ac148cmnt';
	var lockdown = '';
	var dataGovernance = '';
	var translateDiagrams = '';
	var dataGovernanceMap = {
		EU: 'eu',
		US: 'us',
		AU: 'au'
	};
	var generateSVGs = false;
	
	if (configObj != null)
	{
		// Adds support for ui theme
		if (!isSketch && configObj.ui != null)
		{
			ui = configObj.ui;
		}
		
		// Redirects plugins to p URL parameter
		if (configObj.plugins != null)
		{
			plugins = plugins + ';' + configObj.plugins;
		}
		
		AC.hiResPreview = configObj.hiResPreview || false;
		
		lockdown = configObj.lockdown? '&lockdown=1' : '';
		dataGovernance = '&dataGov=' + (dataGovernanceMap[configObj.dataGovernance] || '');
		translateDiagrams = configObj.translateDiagrams? '&translate-diagram=1' : '';
		generateSVGs = configObj.generateSVGs || false;
	}
	
	var editor = document.createElement('iframe');
	editor.setAttribute('width', '100%');
	editor.setAttribute('height', '100%');
	editor.style.width = '100%';
	editor.style.height = '100%';
	editor.setAttribute('id', 'editorFrame');
	editor.setAttribute('frameborder', '0');
//	editor.setAttribute('src', hostUrl + '/?dev=1&test=1&rtCursors=1&' +
	editor.setAttribute('src', hostUrl + '/?' +
			'ui=' + ui + '&p=' + plugins + '&atlas=1&dark=auto&embed=1&embedRT=1' +
			lockdown + dataGovernance + translateDiagrams + (AC.isWhiteboardApp? '&rough=1' : '') +
			((AC.autoExit) ? '&noSaveBtn=1&publishClose=1' : '&saveAndExit=1') +
			'&keepmodified=1&spin=1&libraries=1&browser=0&confLib=1&proto=json' +
		((lang != null) ? '&lang=' + lang : '') + ((site != null) ? '&site=' + encodeURIComponent(site) : '') +
		((user != null) ? '&user=' + encodeURIComponent(user) : '') +
		'&atlas-lic=' + license);

	var initReceived = false;
	var draftHandled = false;
	var waitingForAttachments = false;
	var xmlReceived = null;
	var draftXml = null;
	var loadLibs = null;
	var draftName = null;
	var filename = null;
	var theMacroData = null;
	var pageId = null;
	var draftPage = false;
	var theLocation = null;
	var attachments = null;
	var pageInfo = null;

	var serverName = AC.getSiteUrl();
	var index1 = serverName.indexOf('//');

	if (index1 > 0)
	{
		var index2 = serverName.indexOf('/', index1 + 2);
		
		if (index2 > index1)
		{
			serverName = serverName.substring(index1 + 2, index2);
		}
		else
		{
			serverName = serverName.substring(index1 + 2);
		}
	}
	
	function startEditor()
	{
		if (initReceived && xmlReceived != null && draftHandled && !waitingForAttachments)
		{
			AC.init(baseUrl, theLocation, pageId, editor, filename, xmlReceived, draftName, draftXml, theMacroData, draftPage, loadLibs, refreshConfig, generateSVGs, macroId);
		}
	};
	
	function loadDraft()
	{
		if (waitingForAttachments)
		{
			return;
		}
		
		if (AC.draftEnabled && pageId != null && attachments != null &&
			(draftName != null || xmlReceived == '') && !draftHandled)
		{
			// Searches for pending new drafts from this user
			var prefix = '~drawio~' + user + '~';
			
			// Check if attachments contains draftName
			for (var i = 0; i < attachments.length; i++)
			{
				var fn = attachments[i].title;
				
				// A new diagram draft that was not published (so recover it)
				if (draftName == null && attachments[i].fileSize > 0 &&
					fn.substring(0, prefix.length) === prefix &&
					fn.substring(fn.length - AC.draftExtension.length) === AC.draftExtension)
				{
					var actualFn = fn.substring(prefix.length, fn.length - AC.draftExtension.length);

					// If the draft file failed to be deleted while it is already published, ignore it
					if (attachments.find(function(att) 
						{
							return att.title == actualFn;
						}) == null)
					{
						filename = actualFn;
						draftName = fn;							
					}
				}
				
				if (fn == draftName)
				{
					AC.state.draftMod = new Date(attachments[i].version.when);
					//keeping the block of AP.require to minimize the number of changes!
					{
						var acceptResponse = true;
						var timeoutHandler = function()
						{
							acceptResponse = false;
							document.body.style.backgroundSize = 'auto auto';
							document.body.style.backgroundImage = 'url(/images/stop-flat-icon-80.png)';
							editor.contentWindow.postMessage(JSON.stringify({action: 'spinner', show: false}));
	
							AC.showNotification({
							  title: mxResources.get('confTimeout'),
							  body: mxResources.get('confSrvTakeTooLong', [serverName]),
							  type: 'error',
							  close: 'manual'
							});

							//TODO find how to listen to flag close event, currently just close the editor immediately
//							messages.onClose(message, function()
//							{
				    			AP.dialog.close();
//							});
						};
						
						var timeoutThread = window.setTimeout(timeoutHandler, AC.timeout);
						
						function loadDraftError()
						{
							AC.showNotification({
							  title: mxResources.get('draftReadErr'),
							  body: mxResources.get('draftErrDataLoss'),
							  type: 'error',
							  close: 'manual'
							});
							
							AP.dialog.close();
						};
						
						AC.loadDiagram(pageId, draftName, null, function(loadResp)
						{
							//console.trace('DRAFT: Found', draftName, loadResp);
				    		window.clearTimeout(timeoutThread);
				    		
				    		if (acceptResponse)
						    {
								if (loadResp != null && loadResp.length > 0)
								{
									draftXml = loadResp;
								}
								
								draftHandled = true;
								startEditor();
						    }
						}, function()
						{
							//This error is not tolerable and can cause data loss. So, notify the user and close
					    	window.clearTimeout(timeoutThread);
					    		
					    	if (acceptResponse)
						    {
								loadDraftError();
					    	}
						});
					};
					
					// Terminates function
					return;
				}
			}
		}

		//If draft is not found, continue with actual diagram
		draftHandled = true;
		startEditor();
	};
	
	var initHandler = function(evt)
	{
		if (evt.origin == hostUrl)
		{
			var msg;
			
			try
			{
				msg = JSON.parse(evt.data);
			}
			catch (e)
			{
				AC.logError('BAD CONF CLOUD MSG: ' + evt.data, null, null, null, e, 'SEVER');
				msg = {}; //Ignore this message
			}
			
			if (msg.event == 'configure' && editor.contentWindow != null)
			{
				// Configure must be sent even if JSON invalid
				configObj = configObj || {compressXml: false};

				// Applies debug output
				if (configObj != null && configObj.debug != null)
				{
					AC.DEBUG = configObj.debug;

					AC.log('Configuration', configObj);
				}

				// Overrides default
				if (configObj != null && configObj.compressXml == null)
				{
					configObj.compressXml = false;
				}
				
				editor.contentWindow.postMessage(JSON.stringify({action: 'configure',
					config: configObj}));
			}
			else if (msg.event == 'disableRT')
			{
				AC.disableRT = true;
			}
			else if (msg.event == 'init')
			{
				window.removeEventListener('message', initHandler);
				document.body.style.backgroundImage = 'none';
				initReceived = true;
				startEditor();
			}
		}
	};

	window.addEventListener('message', initHandler);

	AP.getLocation(function(location) 
	{
		theLocation = location;
		
	    var infoReady = function(data, macroData_p)
	    {
	    	if (!AC.inTemplate && (pageId == null || isNaN(pageId)))
    		{
    			document.body.style.backgroundImage = 'url(/images/stop-flat-icon-80.png)';
    			document.body.style.backgroundSize = 'auto auto';
    			
	    		if (data != null && data.target == 'contentcreate') 
	    		{
	    			AC.showNotification({
						  title: mxResources.get('confCannotInsertNew', null, 'Cannot insert draw.io diagram to a new Confluence page'),
						  body: mxResources.get('confSaveTry', null, 'Please save the page and try again.'),
						  type: 'error',
						  close: 'manual'
						});
	    		}
	    		else 
	    		{
	    			AC.showNotification({
						  title: mxResources.get('confCannotGetID', null, 'Unable to determine page ID'),
						  body: mxResources.get('confContactAdmin', null, 'Please contact your Confluence administrator.'),
						  type: 'error',
						  close: 'manual'
						});
	    		}
	    		
	    		//TODO find how to listen to flag close event, currently just close the editor immediately
//    			messages.onClose(message, function()
//    			{
	    			AP.dialog.close();
//    			});
    		}
	    	else
	    	{
	    		// Workaround for blocked referrer policy in iframe
	    		editor.setAttribute('src', editor.getAttribute('src') + '&base=' +
	    			encodeURIComponent(baseUrl + '/pages/viewpage.action?pageId=' + pageId) +
	    			//adding config here to be the last in the url
	    			'&configure=1');
	    		document.body.appendChild(editor);
	    		
		    	// Not needed if drafts not enabled
		    	if (AC.draftEnabled)
		    	{
		    		waitingForAttachments = true;
		    		var acceptResponse2 = true;
		    		var timeoutHandler2 = function()
		    		{
		    			acceptResponse2 = false;
		    			document.body.style.backgroundSize = 'auto auto';
		    			document.body.style.backgroundImage = 'url(/images/stop-flat-icon-80.png)';
		    			editor.contentWindow.postMessage(JSON.stringify({action: 'spinner', show: false}));

		    			AC.showNotification({
							  title: mxResources.get('confTimeout'),
							  body: mxResources.get('confSrvTakeTooLong', [serverName]),
							  type: 'error',
							  close: 'manual'
							});
		    		
		    			//TODO find how to listen to flag close event, currently just close the editor immediately
//		    			messages.onClose(message, function()
//		    			{
			    			AP.dialog.close();
//		    			});
		    		};
		    		
		    		var timeoutThread2 = window.setTimeout(timeoutHandler2, AC.timeout);
				
		    		//TODO do a search instead if possible
		    		AC.getPageAttachments(pageId, function(atts) 
    				{
						window.clearTimeout(timeoutThread2);
			    		
			    		if (acceptResponse2)
				    	{
			    			waitingForAttachments = false;
			    			attachments = atts;
			    			loadDraft();
				    	}
    				}, function(res)
					{
			    		window.clearTimeout(timeoutThread2);
			    		
			    		if (acceptResponse2)
				    	{
			    			waitingForAttachments = false;
			    			draftHandled = true;
				    	}
					});
		    	}
	    	
				var acceptResponse = true;	
				var timeoutHandler = function()
				{
					acceptResponse = false;
					document.body.style.backgroundSize = 'auto auto';
					document.body.style.backgroundImage = 'url(/images/stop-flat-icon-80.png)';
					editor.contentWindow.postMessage(JSON.stringify({action: 'spinner', show: false}));

					AC.showNotification({
						  title: mxResources.get('confTimeout'),
						  body: mxResources.get('confSrvTakeTooLong', [serverName]),
						  type: 'error',
						  close: 'manual'
						});
				
					//TODO find how to listen to flag close event, currently just close the editor immediately
//						messages.onClose(message, function()
//						{
		    			AP.dialog.close();
//						});
				};
				
				var timeoutThread = window.setTimeout(timeoutHandler, AC.timeout);
			
				AP.confluence.getMacroData(function (macroData) 
		    	{
		    		window.clearTimeout(timeoutThread);
		    		
		    		if (acceptResponse)
			    	{
			    		var name = null, revision, owningPageId, templateUrl, isBuiltIn;
	    				
	    				if (AC.customContentEditMode || AC.directEditMode)
    					{
	    					name = macroData_p.diagramName;
	    					revision = macroData_p.revision;
	    					owningPageId = AC.directEditMode? initMacroData.pageId : pageId;
	    					
	    					//fill the macro data
	    					theMacroData = macroData_p;
    					}
	    				else if (macroData != null)
    					{
	    					theMacroData = macroData;
	    					name = macroData.diagramName;
	    					revision = parseInt(macroData.revision);
	    					owningPageId  = macroData.pageId;
							templateUrl = macroData.templateUrl;
							isBuiltIn = macroData.tmpBuiltIn == '1';
							loadLibs = macroData.tempLibs;
							pageInfo = macroData.pageInfo; // Only server macros can have this, and won't have a custom content

							//Check if this template is from server
							var serverTempUrlPrefix = '/download/resources/' + AC.appKey + ':drawio-editor/templates/diagram';

							if (templateUrl && templateUrl.indexOf(serverTempUrlPrefix) == 0)
							{
								templateUrl = templateUrl.substring(serverTempUrlPrefix.length);
								isBuiltIn = true;
							}
    					}
	    				
	    				if ((!AC.inTemplate && templateUrl) || name)
			    		{
				    		draftName = name ? AC.draftPrefix + name + AC.draftExtension : null;
				    		loadDraft();
			    			
			    			if (isNaN(revision))
			    			{
			    				revision = null;
			    			}
			    			
			    			timeoutThread = window.setTimeout(timeoutHandler, AC.timeout);
	
							function loadError(resp)
							{
					    		window.clearTimeout(timeoutThread);
					    		
					    		if (acceptResponse)
						    	{
				    				editor.parentNode.removeChild(editor);
				    				
				    				AC.showNotification({
										  title: mxResources.get('readErr'),
										  body: (resp.status == 404) ?
												  mxResources.get('fileNotFound') : mxResources.get('errorLoadingFile'),
										  type: 'error',
										  close: 'manual'
										});
				    		
				    				//TODO find how to listen to flag close event, currently just close the editor immediately
//				    				messages.onClose(message, function()
//				    				{
						    			AP.dialog.close();
//				    				});
						    	}
			    			};
							
							if (templateUrl)
							{
								AC.curDiagId = false; //No diagram id with templates
								
								function loadTemplate(xml)
								{
									window.clearTimeout(timeoutThread);
									AC.state.isNew = true;
									filename = null;
									xmlReceived = xml;
									startEditor();
								};
								
								if (isBuiltIn)
								{
									var req = new XMLHttpRequest();
									req.open('GET', '/' + templateUrl);
									
									req.onreadystatechange = function()
									{
										if (this.readyState == 4)
										{
											if (this.status >= 200 && this.status <= 299)
											{
												loadTemplate(req.responseText);
											}
											else
											{
												loadError(this);
											}
										}
									};
									
									req.send();
								}
								else
								{
									function fetchTemplate(tmpUrl)
									{
										AP.request({
											url: tmpUrl,
											success: loadTemplate,
											error : function (err)
											{
												if (pageInfo)
												{
													AC.getPageIdFromPageInfo(pageInfo, function(pageId)
													{
														var m = templateUrl.match(AC.attachmentFullUrl);

														if (m != null && m[1] != pageId)
														{
															templateUrl = '/download/attachments/' + pageId + m[2];
															fetchTemplate(templateUrl);
														}
														else
														{
															loadError(err);
														}
													}, loadError);

													pageInfo = null;
												}
												else
												{
													loadError(err);
												}
											}
										});
									};

									fetchTemplate(templateUrl);
								}
							}
							else
							{
				    			AC.loadDiagram(pageId, name, configObj && configObj.disableVersioning? null : revision, function(loadResp, curPageId, curDiagName)
				    			{
									AC.actualPageId = curPageId;

									function getAttInfo()
									{
										//Get current diagram information which is needed for comments & RT
										AC.getAttachmentInfo(curPageId, curDiagName, true, function(info, attInfo)
										{
											window.clearTimeout(timeoutThread);
										
											if (acceptResponse)
											{
												filename = curDiagName;
												xmlReceived = loadResp;
												//TODO curDiagVer & curDiagId can be added to AC.state
												AC.curDiagVer = info.version.number;
												AC.macroVer = revision;
												AC.curDiagMod = new Date(info.version.when);
												AC.curDiagId = info.id;
												AC.curAttInfo = attInfo;
												startEditor();
											}
										}, loadError);
									};

									// There is an error with draft pages where the pageId is not the actual pageId!
									if (draftPage)
									{
										// Confirm the new pageId is correct (when a macro is copied, this action breaks the editor)
										// TODO Review when merged with v2 APIs branch
										AP.request({
											url: '/api/v2/pages/' + curPageId,
											success: function(data)
											{
												data = JSON.parse(data);

												if (data.status == 'draft')
												{
													pageId = curPageId;
												}

												getAttInfo();
											},
											error: function(err)
											{
												getAttInfo();
											}
										});
									}
									else
									{
										getAttInfo();
									}
				    			}, loadError, owningPageId, true, pageInfo);
							}
			    		}
			    		else
			    		{
							AC.state.isNew = true;
			    			filename = null;
				    		xmlReceived = '';
				    		loadDraft();
			    		}
			    	}
		    	});
	    	}
	    };
		
	    var extEditingError = function()
	    {
	    	AC.showNotification({
				  title: mxResources.get('editingErr'),
				  body: mxResources.get('confExtEditNotPossible'),
				  type: 'error',
				  close: 'manual'
				});
	
			AP.dialog.close({noBack: true});
	    };
	    
		//keeping the block of AP.require to minimize the number of changes!
		{
		    AP.navigator.getLocation(function (data)
		    {
		    	AC.inComment = (data != null && data.context != null && data.context.contentType == 'comment');
				AC.inTemplate = (data != null && data.context != null && data.context.contentType == 'template');

	    		if (AC.directEditMode)
				{
					//Upload embed macro case
					if (initMacroData.isUpload)
					{
						AC.isUploadMode = true;
						draftPage = (data && data.target == 'contentcreate');
					}

					pageId = openingPageId? openingPageId: initMacroData.pageId;
					infoReady(null, initMacroData);
				}
				else if (AC.customContentEditMode) //we can also find the contentId in data.target == 'addonmodule' and data.context.context["content.id"][0]
    			{
	    			//load the custom content to get the page info
	    			AP.request({
                        type: 'GET',
                        url: '/api/v2/custom-content/' + contentId + '?body-format=storage' + (contentVer? ('&version=' + contentVer) : ''),
                        contentType: 'application/json;charset=UTF-8',
                        success: function (resp) 
                        {
							try
							{
								resp = JSON.parse(resp);
								
								var info = JSON.parse(decodeURIComponent(resp.body.storage.value));
								
								pageId = info.pageId;
								info.displayName = resp.title;
								info.contentVer = resp.version.number;
								
								//Out of sync custom content. This happen when a page is moved/copied
								if (initMacroData != null && 
										((initMacroData.pageId != null && (initMacroData.pageId != pageId || (resp.pageId && resp.pageId != pageId) || (resp.blogPostId && resp.blogPostId != pageId))) 
										|| (initMacroData.diagramName != null && initMacroData.diagramName != info.diagramName)
										|| (!initMacroData.isUpload && initMacroData.revision != null && initMacroData.revision != info.version)))
								{
									pageId = initMacroData.pageId; 
									
									AC.state.customContentMismatch = true;
								}
								else
								{
									AC.state.customContentMismatch = false;
								}
								
								//Upload embed macro case
								if (initMacroData != null && initMacroData.isUpload)
								{
									AC.isUploadMode = true;
									draftPage = (data && data.target == 'contentcreate');
									initMacroData.contentVer = info.contentVer;
									infoReady(null, initMacroData);
									return;	
								}
								
								AC.findMacroInPage(pageId, info.diagramName, false, function(macroFound, originalBody, matchingMacros, page)
								{
									if (macroFound)
									{
										// The page macro is not updated yet since we save to a property
										matchingMacros[0].macroParams['revision'] = info.version;
										infoReady(null, matchingMacros[0].macroParams);
									}
									else //A published page that has a draft content containing the diagram OR the diagram is deleted from the page OR diagram is edited and page is old!
									{
										var directPageEdit = contentVer != null;
										
										if (directPageEdit)
										{
											//We added translation since sometimes resources doesn't load quickly for this error
											AC.showNotification({
												title: mxResources.get('confEditedExt', null, 'Diagram/Page edited externally'),
												body: mxResources.get('confEditedExtRefresh', null, 'Diagram/Page is edited externally. Please refresh the page.'),
												type: 'error',
												close: 'manual'
											});
											AP.dialog.close({noBack: true, noBackOnClose: directPageEdit});                            			
										}
										else //If this is edit of a custom content, we allow editing since it can be a stranded diagram (only exists as an attachment and custom contents BUT not as a macro)
										{
											//TODO Review this is still needed
											//We added translation since sometimes resources doesn't load quickly for this error
											if (info.version)
											{
												AC.showNotification({
													title: mxResources.get('macroNotFound', null, 'Macro Not Found'),
													body: mxResources.get('confEditDraftDelOrExt', null, 'This diagram is in a draft page, is deleted from the page, or is edited externally. ' + 
																'It will be saved as a new attachment version and may not be reflected in the page.'),
													type: 'warning',
													close: 'manual'
												});
											}
											else
											{
												AC.isUploadMode = true;
											}
											
											AC.strandedMode = true;
											//Add required info that is usually found in the macro
											info.contentId = contentId;
											info.custContentId = contentId;
											info.revision = info.version;
											info.diagramDisplayName = info.displayName;
											infoReady(null, info);
										}
									}
								}, function() //On error, it means the page is a newly created draft that is not published
								{
									AC.showNotification({
										title: mxResources.get('diagNotFound'),
										body: mxResources.get('confDiagNotPublished'),
										type: 'error',
										close: 'manual',
										actions: {
											'actionkey': mxResources.get('retBack')
										}
									});
						
									AP.dialog.close({noBack: true});
								}, null, null, null, null, AC.isSketch, macroId); //TODO Should we search through drafts also?
							}
							catch(e)
							{
								console.log(e);
								extEditingError();
							}
                        },
                        error: extEditingError //We can create the custom content and fix this case but it adds more complexity to rare situation (e.g., a page is copied then the source page is deleted) 
                    });
    			}
	    		else if (data != null && data.context != null
			    		&& (data.target == 'contentedit' || data.target == 'contentcreate' || AC.inComment))
	    		{
		    		draftPage = (data.target == 'contentcreate');
		    		pageId = data.context.contentId;
		    		infoReady(data);
		    	}
	    		else
    			{
	    			infoReady();
    			}
		    });
		};
	});
};


AC.getPageAttachments = AC.contentTypeFnWrapper(function(pageId, success, error)
{
	AC.getAllItemsCursor('/api/v2/' + (AC.contentTypeCache[pageId].isBP? 'blogposts' : 'pages') + '/' + pageId + '/attachments?limit=250', success, error);
});

AC.getCurPageAttachments = function(success, error)
{
	AC.getPageAttachments(AC.state.pageId, success, error);
};

AC.searchDiagrams = function(searchStr, username, success, error)
{
	//Note: we manually filter trashed diagrams as we couldn't make cqlcontext={"contentStatuses":["current"]} work
	AP.request({
		//cannot use * as a first character https://jira.atlassian.com/browse/JRASERVER-6218 (also * doesn't work with some Asian language')
		url: '/rest/api/content/search?cql=' + encodeURIComponent('type="ac:' + AC.macroType + '" and (title ~ "' + searchStr + '*" or title ~ "' + searchStr + '")' +
				(username? ' and creator = currentUser()' : '')) + '&limit=50&expand=body.storage,version',  
		success: function(resp) 
		{
			resp = JSON.parse(resp);
			var retList = [];
			var gliffyList = [];
			var list = resp.results; 
			var customContentMap = {};
			if (list)
			{
				//Add items in the list and convert the list to map so we can search by name efficiently
				for (var i = 0; i < list.length; i++)
				{
					if (list[i].status == 'trashed') continue;
					
					try 
					{
						var attInfo = JSON.parse(decodeURIComponent(list[i]["body"]["storage"]["value"]));
						
						if (attInfo.custom) continue; //Exclude embedded diagrams
						
						customContentMap[attInfo.pageId + '|' + attInfo.diagramName] = true;
						
						retList.push({
							isExt: true,
							title: list[i].title,
							url: "/download/attachments/" + attInfo.pageId + "/"
								+ encodeURIComponent(attInfo.diagramName),
							info: {
								id: list[i].id,
								contentId: list[i].id,
								custContentId: list[i].id,
								contentVer: list[i].version.number,
								pageId: attInfo.pageId,
								version: attInfo.version,
								name: attInfo.diagramName,
								displayName: list[i].title,
								isSketch: attInfo.isSketch
							},
							changedBy: list[i].version.by.displayName,
							lastModifiedOn: list[i].version.when,
							imgUrl: baseUrl + "/download/attachments/" + attInfo.pageId + "/"
								+ encodeURIComponent(attInfo.diagramName)
								+ ".png?api=v2"
						});
					}
					catch(e)
					{
						//ignore, this should not happen!
						console.log(e);
					}
				}
			}
			
			//No Gliffy results in Templates, also stop in whiteboard app since there is no old diagrams without custom contents
			if (AC.inTemplate || AC.isWhiteboardApp)
			{
				success(retList);
				return;
			}
			
			//This request search for Gliffy files as well as to support old draw.io diagrams that have no associated draw.io custom contents
			AP.request({
				//cannot use * as a first character https://jira.atlassian.com/browse/JRASERVER-6218
				url: '/rest/api/content/search?cql=' + encodeURIComponent('type=attachment and (title ~ "' + searchStr + '*" or title ~ "' + searchStr + '*.png")' + 
						(username? ' and creator = currentUser()' : '')) + '&limit=200&expand=metadata,version', //limit is 200 to get as much results as possible
				success: function(resp) 
				{
					resp = JSON.parse(resp);
					var list = resp.results; 
					if (list)
					{
						var attMap = {};
						//convert the list to map so we can search by name efficiently
						for (var i = 0; i < list.length; i++)
						{
							if (list[i].status == 'trashed') continue;
							
							//key is pageId + | + att name
							var pageId = list[i]["_links"]["webui"].match(/pages\/(\d+)/);
							
							if (pageId != null)
							{
								var key = pageId[1] + '|' + list[i].title;
								
								//exclude contents already found in the custom contents
								if (!customContentMap[key])
								{
									attMap[key] = {att: list[i], pageId: pageId[1]};
								}
							}
						}

						function getAttObj(att, isImport, noImg)
						{
							var obj = {
								isExt: true,
								title: att.att.title,
								url: "/download/attachments/" + att.pageId + "/"
									+ encodeURIComponent(att.att.title),
								info: {
									id: att.att.id, 
									pageId: att.pageId,
									name: att.att.title,
									isImport: isImport
								},
								changedBy: att.att.version.by.displayName,
								lastModifiedOn: att.att.version.when
							};
							
							if (noImg)
							{
								obj.noImg = true;
							}
							else
							{
								obj.imgUrl = baseUrl + '/download/attachments/' + att.pageId + '/'
											+ encodeURIComponent(att.att.title)
											+ '.png?api=v2';
							}
							
							return obj;
						};
						
						for (var key in attMap) 
						{
							var att = attMap[key];
							var mimeType = att.att.metadata.mediaType;
							
							if (mimeType == 'application/gliffy+json')
							{
								gliffyList.push(getAttObj(att, true));
							}
							else if (mimeType == 'text/plain' && attMap[key+'.png']) //each draw.io attachment should have an associated png preview and mimeType is text/plain
							{
								//We cannot get the latest version info, it can be searched when a diagram is selected
								retList.push(getAttObj(att));
							}
						}
					}

					success(retList, null, {"Gliffy": gliffyList});
				},
				error : error
			});
		},
		error : error
	});
};

AC.getRecentDiagrams = function(username, success, error)
{
	//I think it is safe now to base the recent documents on draw.io custom contents only since it is in production for long time now
	AP.request({
		url: '/rest/api/content/search?cql=' + encodeURIComponent('type="ac:' + AC.macroType + '" and lastmodified > startOfDay("-7d")') + 
					(username? '%20and%20creator%20=%20currentUser()' : '') + '&limit=50&expand=body.storage,version', // type="ac:' + AC.macroType + '" and lastmodified > startOfDay("-7d") [and creator = currentUser()] //modified in the last 7 days
		success: function(resp) 
		{
			resp = JSON.parse(resp);
			var retList = [];
			var list = resp.results; 
			if (list)
			{
				//Add items in the list
				for (var i = 0; i < list.length; i++)
				{
					if (list[i].status == 'trashed') continue;
					
					try 
					{
						var attInfo = JSON.parse(decodeURIComponent(list[i]["body"]["storage"]["value"]));
						
						if (attInfo.custom) continue; //Exclude embedded diagrams
						
						retList.push({
							isExt: true,
							title: list[i].title,
							url: "/download/attachments/" + attInfo.pageId + "/"
								+ encodeURIComponent(attInfo.diagramName),
							info: {
								id: list[i].id,
								contentId: list[i].id,
								custContentId: list[i].id,
								contentVer: list[i].version.number,
								pageId: attInfo.pageId,
								version: attInfo.version,
								name: attInfo.diagramName,
								displayName: list[i].title
							},
							changedBy: list[i].version.by.displayName,
							lastModifiedOn: list[i].version.when,
							imgUrl: baseUrl + "/download/attachments/" + attInfo.pageId + "/"
								+ encodeURIComponent(attInfo.diagramName)
								+ ".png?api=v2"
						});
					}
					catch(e)
					{
						//ignore, this should not happen!
						console.log(e);
					}
				}
			}
			
			success(retList);
		},
		error : error
	});
};

AC.getPageDrawioDiagrams = AC.contentTypeFnWrapper(function(pageId, success, error)
{
	AP.request({
        type: 'GET',
		// TODO Add paging support if diagrams are more than 250!
        url: '/api/v2/' + (AC.contentTypeCache[pageId].isBP? 'blogposts' : 'pages') + '/' + pageId + '/custom-content?type=ac:' + AC.macroType + '&limit=250&body-format=storage',
        contentType: 'application/json;charset=UTF-8',
        success: function (resp) 
        {
        	resp = JSON.parse(resp);
			var retList = [];
			var list = resp.results; 
			
			if (list)
			{
				//Add items in the list
				for (var i = 0; i < list.length; i++)
				{
					if (list[i].status == 'trashed') continue;
					
					try 
					{
						var attInfo = JSON.parse(decodeURIComponent(list[i]["body"]["storage"]["value"]));
						
						if (attInfo.custom) continue; //Exclude embedded diagrams
						
						var diagramName = list[i].title.replace('.drawio', '');
						
						retList.push({
							isExt: true,
							title: diagramName,
							url: "/download/attachments/" + attInfo.pageId + "/"
								+ encodeURIComponent(attInfo.diagramName),
							info: {
								id: list[i].id,
								contentId: list[i].id,
								custContentId: list[i].id,
								contentVer: list[i].version.number,
								pageId: attInfo.pageId,
								version: attInfo.version,
								name: attInfo.diagramName,
								displayName: diagramName
							},
							obj: list[i],
							imgUrl: baseUrl + "/download/attachments/" + attInfo.pageId + "/"
								+ encodeURIComponent(attInfo.diagramName)
								+ ".png?api=v2"
						});
					}
					catch(e)
					{
						//ignore, this should not happen!
						console.log(e);
					}
				}
			}
			
			success(retList);
        },
        error: error
	});
});

AC.getCustomTemplates = function(success, error)
{
	var customCats = {};
	var customCatsCount = 0;
	var customCatsDone = 0;
	
	function checkDone()
	{
		customCatsDone++;
		
		if (customCatsCount == customCatsDone)
		{
			success(customCats, customCatsDone);
		}
	}
	
	AC.getCurrentUserTeams(function(teams, user, teamsMap)
	{
		AP.request({
			type: 'GET',
			url: '/rest/api/content/search?cql=type%3Dpage%20and%20space%3DDRAWIOCONFIG%20and%20title~Templates*', //type=page and space=DRAWIOCONFIG and title~Templates*.
			contentType: 'application/json;charset=UTF-8',
			success: function (resp) 
			{
				resp = JSON.parse(resp);
				var tempPageId = null;      
				var tempCats = []; 

				for (var i = 0; i < resp.size; i++)
				{
					var page = resp.results[i];
					var title = page.title;

					if (title.substring(0, 9) == 'Templates')
					{
						var teamName = title.substring(10);

						if (teamName == '')
						{
							tempPageId = page.id;
						}
						else if (teamsMap[teamName] != null)
						{
							page.title = mxResources.get('xyzTeam', [teamName.substring(7)], '{1} Team');
							tempCats.push(page);
						}
					}				
				}
				
				function fillTemps()
				{
					if (tempCats.length > 0)
					{
						for (var i = 0; i < tempCats.length; i++)
						{
							var cat = tempCats[i];
							customCats[cat.title] = [];
							customCatsCount++;
							
							(function(cat2){
								AC.findMacroInPage(cat2.id, null, null, function(sketchMacroFound, originalBody, matchingSkwtchMacros, page)
								{
									AC.findMacroInPageObj(page, null, null, function(macroEmbedFound, originalBody, matchingEmbedMacros, page)
									{
										AC.findMacroInPageObj(page, null, null, function(macroFound, originalBody, matchingMacros, page)
										{
											matchingMacros = matchingMacros.concat(matchingSkwtchMacros)
																	.concat(matchingEmbedMacros.filter((m) => m.macroParams && m.macroParams.isUpload));
											
											if (matchingMacros.length > 0)
											{
												var catList = [];

												for (var i = 0; i < matchingMacros.length; i++)
												{
													try
													{
														var params = matchingMacros[i].macroParams;
														var diagramName = params.diagramName? params.diagramName.replace('.drawio', '') : 
																params.templateUrl.substring(params.templateUrl.lastIndexOf('/') + 1).replace('.drawio', '');
									
														catList.push({
															isExt: true,
															title: diagramName,
															url: params.templateUrl? params.templateUrl : '/download/attachments/' + cat2.id + '/'
																	+ encodeURIComponent(params.diagramName),
															imgUrl: baseUrl + (params.templateUrl? params.templateUrl : '/download/attachments/' + cat2.id + '/'
																+ encodeURIComponent(params.diagramName)) + '.png?api=v2'
														});
													}
													catch(e)
													{
														// ignore
														console.log(e, i, matchingMacros, cat2);
													}
												}

												if (catList.length > 0)
												{
													customCats[cat2.title] = catList;
												}
												else
												{
													delete customCats[cat2.title];
												}
											}
											else
											{
												delete customCats[cat2.title];
											}

											checkDone();
										}, true);
									}, true, true);
								}, checkDone, false, true, null, null, true); //On error, just ignore this page
							})(cat);
						}
					}
					else 
					{
						success({}, 0);
					}
				};

				if (tempPageId)
				{
					AP.request({
						type: 'GET',
						url: '/rest/api/content/search?limit=250&cql=type%3Dpage%20and%20space%3DDRAWIOCONFIG%20and%20ancestor%3D' + tempPageId, //type=page and space=DRAWIOCONFIG and ancestor={tempPageId}. Limit 200 which is most probably more than enough
						contentType: 'application/json;charset=UTF-8',
						success: function (resp) 
						{
							resp = JSON.parse(resp);
							Array.prototype.push.apply(tempCats, resp.results);
							fillTemps();
						},
						error: error
					});
				}
				else 
				{
					fillTemps();
				}
			},
			error: error
		});
	}, error);
};

AC.handleDuplicate = function(pageId, diagramName, diagramDisplayName, xml, draftPage, macroId)
{
	var directEdit = AC.customContentEditMode || AC.directEditMode;
	// Wait 5 sec such that draft page is updated with the latest changes (if not direct edit)
	setTimeout(function()
	{
		AC.isMacroDuplicate(pageId, diagramName, AC.isSketch, !directEdit, function()
		{
			AC.getConfPageEditorVer(pageId, handleDuplicate);
		});
			
		function handleDuplicate(editorVer)
		{
			if (editorVer == 1 && !directEdit)
			{
				// Ignoring duplicate in editing from the old editor
				return;
			}

			// When custom content is edited, we cannot find the macro to replace without the macro id (the case in list and attachments views)
			if (directEdit && !macroId)
			{
				AC.showNotification({
					title: mxResources.get('diagDupl'),
					body: mxResources.get('diagDuplNoEditMsg'),
					type: 'warning',
					close: 'auto'
				}, true);
				return;
			}

			var newDiagramName = Date.now() + '-' + diagramName;

			// Copy the diagram, create a new CC, then update the macro [Editor Restart is needed]
			// TODO Eleminate the need for editor restart
			// TODO Should we ignore errors?
			AC.saveDiagram(pageId, newDiagramName, xml,
				function(resp)
				{
					resp = JSON.parse(resp).results[0];
					var spaceKey = AC.getSpaceKey(resp._expandable.space);
					var pageType = resp.container.type;

					AC.saveCustomContent(spaceKey, pageId, pageType, newDiagramName, diagramDisplayName, 1, 
						null, null,
						function(responseText) 
						{
							AC.finishMacroReplacement = function() 
							{
								var content = JSON.parse(responseText);
								
								AC.findMacroInPage(pageId, null, null, function(macroFound, originalBody, matchingMacros, page)
								{
									if (macroFound)
									{
										var updatedMacro = matchingMacros.find(function(macro)
										{
											return macroId? macro.macroParams.macroId == macroId : macro.macroParams.diagramName == diagramName;
										});

										updatedMacro.macroParams.revision = 1; // Change version here to bypass the check in adjustMacroParametersDirect
										// Clone and update the macro
										updatedMacro = JSON.parse(JSON.stringify(updatedMacro.macroParams));
										updatedMacro.diagramName = newDiagramName;
										updatedMacro.custContentId = content.id;
										delete updatedMacro.contentId;
										updatedMacro.contentVer = 1;
										macroId = updatedMacro.macroId;
										delete updatedMacro.macroId;

										if (directEdit)
										{
											AC.adjustMacroParametersDirect(pageId, updatedMacro,
												originalBody, matchingMacros, page, function()
												{
													AC.showNotification({
														title: mxResources.get('diagDupl'),
														body: mxResources.get('diagDuplMsg'),
														type: 'warning',
														close: 'auto'
													}, true, {
														newRev: 1,
														newContentVer: 1,
														newContentId: content.id,
														newName: newDiagramName,
														noPageUpdate: true
													});
												}, AC.noop, macroId, true);
										}
										else
										{
											AP.confluence.saveMacro(updatedMacro);
											AC.showNotification({
												title: mxResources.get('diagDupl'),
												body: mxResources.get('diagDuplMsg'),
												type: 'warning',
												close: 'auto'
											}, true);
										}
									}
								}, AC.noop, !directEdit, true, null, null, AC.isSketch);
							}

							if (editorVer == 2 || directEdit)
							{
								AC.finishMacroReplacement();
							}
							else
							{
								// TODO This doesn't work, the macro is not updated with or without an image
								// Save dummy image and proceed such that old editor accepts the new macro
								//AC.saveDiagram(pageId, newDiagramName + '.png',
								//		AC.b64toBlob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==', 'image/png'),
								//		AC.finishMacroReplacement, AC.finishMacroReplacement, false, 'image/png', mxResources.get('drawPrev'), false, draftPage);
							}
						}, AC.noop, []);
				}, AC.noop, false, 'application/vnd.jgraph.mxfile', mxResources.get('drawDiag'), false, draftPage)
		};
	}, directEdit? 0 : 5000);
};

AC.init = function(baseUrl, location, pageId, editor, diagramName, initialXml, draftName, draftXml, macroData, draftPage, loadLibs, refreshConfig, generateSVGs, macroId)
{
	// Hides the logo
	document.body.style.backgroundImage = 'none';
	var user = null;
	
	AP.user.getCurrentUser(function(atlUser) 
	{
		user = atlUser.atlassianAccountId;
	});
	
	var draftExists = false;

	var diagramDisplayName = diagramName, contentId = null, contentVer = null, lastMacroVer = null, revision = null;

	if (macroData != null)
	{
		diagramDisplayName = macroData.diagramDisplayName || diagramName;
		contentId = macroData.contentId || macroData.custContentId;
		contentVer = macroData.contentVer;
		lastMacroVer = macroData.revision;
		AC.aspect = macroData.aspect;
		AC.hiResPreview = macroData.hiResPreview != null? macroData.hiResPreview == '1' : AC.hiResPreview;
	}

	AC.state.pageId = pageId;
	AC.state.diagramName = diagramName;
	AC.state.revision = lastMacroVer; //TODO Confirm
	AC.state.contentId = contentId;
	AC.state.contentVer = contentVer;
	AC.state.draftName = draftName;
	
	//Check custom content is in sync
	if (AC.state.customContentMismatch == null && contentId != null)
	{
		AP.request({
            type: 'GET',
            url: '/api/v2/custom-content/' + contentId + '?body-format=storage' + (contentVer? ('&version=' + contentVer) : ''),
            contentType: 'application/json;charset=UTF-8',
            success: function (resp) 
            {
				try
				{
					resp = JSON.parse(resp);
					var info = JSON.parse(decodeURIComponent(resp.body.storage.value));
					
					//Out of sync custom content. This happen when a page is moved/copied
					if (info.pageId != pageId 
							|| (resp.pageId && resp.pageId != pageId) || (resp.blogPostId && resp.blogPostId != pageId)
							|| diagramName != info.diagramName)
					{
						AC.state.customContentMismatch = true;
					}
				}
				catch(e)
				{
					AC.state.customContentMismatch = true;
				}
			},
			error: function(err)
			{
				//TODO Should we consider other errors?
				if (err.status == 404)
				{
					AC.state.customContentMismatch = true;
				}
			}
		});
	}
	
	//keeping the block of AP.require to minimize the number of changes!
	{
		var newPage = location.indexOf('createpage.action') > -1 ? true : false;
		var diagramXml = null;
		var link = document.createElement('a');
		link.href = location.href;
		link.href = link.href; //to have 'host' populated under IE
		var hostUrl = link.protocol + '//' + link.hostname;
		
	   	function removeDraft(fn, force)
	   	{
			if (draftExists || force)
			{
				AC.removeDraft(pageId, draftName, user, fn);
			}
			else if (fn != null)
			{
				fn();
			}
	   	};
		
	   	function saveDraft(xml, success, error)
	   	{
			if (draftName == null)
			{
				if (success)
				{
					success({}); //Without a name, just return successfully
				}
				return;
			}
			
	   		//console.trace('DRAFT: Save', draftName, xml);
			AC.saveDiagram(pageId, draftName,
				xml,
				function(res)
				{
					draftExists = true;
					success(res);
				}, error, false, 'application/vnd.jgraph.mxfile', 
				mxResources.get('createdByDraw'), false, draftPage, true);
	   	};
	   	
		AC.saveDraft = saveDraft;
		
		function showTemplateDialog()
		{
			if (AC.draftEnabled)
			{
				editor.contentWindow.postMessage(JSON.stringify({action: 'template', callback: true, enableRecent: true, enableSearch: true, enableCustomTemp: true, templatesOnly: AC.inTemplate, withoutType: 1}));
			}
			else
			{
				editor.contentWindow.postMessage(JSON.stringify({action: 'template', enableRecent: true, enableSearch: true, enableCustomTemp: true, templatesOnly: AC.inTemplate, withoutType: 1}));
			}
		};
		
		function promptName(name, err, errKey)
		{
			editor.contentWindow.postMessage(JSON.stringify({action: 'prompt',
				titleKey: 'filename', okKey: 'save', defaultValue: name || '' }));
			
			if (err != null || errKey != null)
			{
				editor.contentWindow.postMessage(JSON.stringify({action: 'dialog',
					titleKey: 'error', message: err, messageKey: errKey,
					buttonKey: 'ok'}));
			}
		};
		
		function checkName(name, fn, err)
		{
			if (name == null || name.length == 0)
			{
				err(name, mxResources.get('filenameShort'));
			}
			else if (/[&\*+=\\;/{}|\":<>\?~]/g.test(name))
			{
				err(name, mxResources.get('invalidChars') + ' \\ / | : { } < > & + ? = ; * " ~');
			}
			else
			{
				name = name.trim();
	    		//TODO do a search instead if possible
	    		AC.getPageAttachments(pageId, function(attachments) 
				{
	    			var draftPattern = new RegExp('^~drawio~.*~' + name.
							replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&") + '.tmp$', 'i');
					var lc = name.toLowerCase();
					var dn = AC.draftPrefix + lc + AC.draftExtension
					var fileExists = false;

					// Checks if any files will be overwritten
					for (var i = 0; i < attachments.length && !fileExists; i++)
					{
						// To avoid name clash with new diagrams of other users,
						// we need to check for ~drawio~.*~filename.tmp
						var an = attachments[i].title.toLowerCase();

						if (an == lc || an == lc + '.png' || (AC.draftEnabled &&
							(an == dn || draftPattern.test(an))))
						{
							fileExists = true;
						}
					}
					
					if (fileExists)
					{
						err(name, mxResources.get('alreadyExst', [name]));
					}
					else
					{
						fn(name);
					}

				}, function(res)
				{
					try
					{
						res = JSON.parse(res.responseText);
					}
					catch(e)
					{
						res = res || {};
					}
					
					err(name, res.message || mxResources.get('unknownError'));	
				});
			}
		};

	   	var autosaveThread = null;
	   	var autosaveCounter = 0;
	   	var currentXml = null;
		var unpublishedChanges = AC.curDiagMod < AC.state.draftMod;
		var usingHistoricVer = AC.curDiagVer > AC.macroVer;

	   	//Note: We don't use embed mode auto saving, instead, we save with the embed file (which sends the autosave message)
	   	//Always load draft files as it contains the latest unpublished version
		if (!AC.disableRT && draftXml != null)
		{
			// When a historic version is loaded, the draft is not in sync. So, load the diagram itself if draft has no changes
			AC.state.hasDraft = !AC.state.isNew && !(usingHistoricVer && !unpublishedChanges && initialXml != '');
			var loadXml = AC.state.hasDraft || AC.state.isNew? draftXml : initialXml;
			editor.contentWindow.postMessage(JSON.stringify({action: 'load',
				autosave: AC.state.isNew? 1 : 0, title: diagramDisplayName,
				xml: loadXml, unpublishedChanges: unpublishedChanges,
				macroData: macroData, attInfo: AC.curAttInfo}));
			// When a draft is found, we only check this page for duplicates
			AC.handleDuplicate(pageId, diagramName, diagramDisplayName, initialXml || loadXml, draftPage, macroId);
		}
		//Load actual diagram in case the draft is not found
		else if (initialXml != '')
		{
			editor.contentWindow.postMessage(JSON.stringify({action: 'load',
				autosave: AC.disableRT || AC.state.isNew? 1 : 0, xml: initialXml, title: diagramDisplayName,
				libs: loadLibs, macroData: macroData, attInfo: AC.curAttInfo}));
			// When a draft is not found, we check the diagram actual page for duplicates
			// We copy the diagram when it is loaded from another page, so this is a safe guard only
			AC.handleDuplicate(AC.actualPageId || pageId, diagramName, diagramDisplayName, initialXml, draftPage,  macroId);
		}
		// New sketch diagrams open empty
		else if (AC.isSketch && !AC.inTemplate) //If in template editor, show templates also
		{
			editor.contentWindow.postMessage(JSON.stringify({action: 'load',
				autosave: 1, xml: '', toSketch: 1}));
		}		
		// Shows template dialog for new diagrams with no draft state
		else
		{
			showTemplateDialog();
		}
		
		var messageListener = function(evt)
		{
			if (typeof window.AC !== 'undefined' && evt.origin == hostUrl)
			{
				var drawMsg;
				
				try
				{
					drawMsg = JSON.parse(evt.data);
					AC.log('message', 'evt', [evt], 'drawMsg', [drawMsg]);
				}
				catch (e)
				{
					AC.logError('BAD CONF CLOUD MSG: ' + evt.data, null, null, null, e, 'SEVER');
					drawMsg = {}; //Ignore this message
				}
	
				if (drawMsg.event == 'template')
				{
					AC.curDiagId = false; //New diagram, so no diagram id
					editor.contentWindow.postMessage(JSON.stringify({action: 'spinner',
						show: true, messageKey: 'inserting'}));

					if (AC.inTemplate)
					{
						var templateUrl = (drawMsg.builtIn? drawMsg.tempUrl : drawMsg.docUrl) || drawMsg.tempUrl;
						
						if (templateUrl)
						{
							AP.confluence.saveMacro({
								baseUrl: baseUrl,
								templateUrl: templateUrl,
								tmpBuiltIn: drawMsg.builtIn? '1' : '0',
								tempLibs: drawMsg.libs
							});
						}
						
						AP.dialog.close();
					}
					else if (drawMsg.docUrl)
					{
						checkName(drawMsg.name, function(name)
						{
							diagramName = name;
							AC.state.diagramName = name;
							diagramDisplayName = name;
							
							//keeping the block of AP.require to minimize the number of changes!
							{
								var loadTemplate = function()
								{
									AP.request({
										url: drawMsg.docUrl,
										success: function(xml) 
										{
											editor.contentWindow.postMessage(JSON.stringify({action: 'load',
												autosave: AC.disableRT || AC.state.isNew? 1 : 0, xml: xml, title: diagramDisplayName, toSketch: AC.isSketch}));
											editor.contentWindow.postMessage(JSON.stringify({action: 'spinner',
												show: false}));
										},
										error : function(resp) 
										{
											editor.contentWindow.postMessage(JSON.stringify({action: 'spinner',
												show: false}));
											editor.contentWindow.postMessage(JSON.stringify({action: 'dialog',
												titleKey: 'error', message: mxResources.get('diagCantLoad'), messageKey: null,
												buttonKey: 'ok'}));
										}
									});
								}
								
								loadTemplate();
							};
						},
						function(name, err, errKey)
						{
							editor.contentWindow.postMessage(JSON.stringify({action: 'spinner',
								show: false}));
							editor.contentWindow.postMessage(JSON.stringify({action: 'dialog',
								titleKey: 'error', message: err, messageKey: errKey,
								buttonKey: 'ok'}));
						});
					}
					else
					{
						checkName(drawMsg.name, function(name)
						{
							editor.contentWindow.postMessage(JSON.stringify({action: 'spinner',
								show: false}));
							diagramName = name;
							AC.state.diagramName = name;
							diagramDisplayName = name;
	
							if (AC.draftEnabled)
							{
								draftName = '~drawio~' + user + '~' + diagramName + AC.draftExtension;
								editor.contentWindow.postMessage(JSON.stringify({action: 'spinner',
									show: true, messageKey: 'inserting'}));
								
								saveDraft(drawMsg.xml, function()
								{
									editor.contentWindow.postMessage(JSON.stringify({action: 'spinner', show: false}));
									editor.contentWindow.postMessage(JSON.stringify({action: 'load',
										autosave: AC.disableRT || AC.state.isNew? 1 : 0, xml: drawMsg.xml, title: diagramDisplayName, toSketch: AC.isSketch}));
								},
								function(err)
								{
									editor.parentNode.removeChild(editor);

									AC.showNotification({
										  title: mxResources.get('draftWriteErr'),
										  body: err.status == 413? mxResources.get('confFileTooBigErr') : 
													(err.status == 403? mxResources.get('confDraftPermissionErr') : 
														mxResources.get('draftCantCreate')),
										  type: 'error',
										  close: 'manual'
										});
				    		
									//TODO find how to listen to flag close event, currently just close the editor immediately
//				    				messages.onClose(message, function()
//				    				{
						    			AP.dialog.close();
//				    				});
								});
							}
							else
							{
								editor.contentWindow.postMessage(JSON.stringify({action: 'load',
									autosave: AC.disableRT || AC.state.isNew? 1 : 0, xml: drawMsg.xml, title: diagramDisplayName, toSketch: AC.isSketch}));
							}
						},
						function(name, err, errKey)
						{
							editor.contentWindow.postMessage(JSON.stringify({action: 'spinner',
								show: false}));
							editor.contentWindow.postMessage(JSON.stringify({action: 'dialog',
								titleKey: 'error', message: err, messageKey: errKey,
								buttonKey: 'ok'}));
						});
					}
				}
				else if (drawMsg.event == 'autosave')
				{
					// Saves all changes to draft attachment
					currentXml = drawMsg.xml;
					
					if (autosaveThread == null && AC.draftEnabled)
					{
						autosaveThread = window.setTimeout(function()
						{
							autosaveThread = null
							saveDraft(currentXml, AC.noop, AC.noop);
							autosaveCounter++;
						}, (autosaveCounter == 0) ? 0 : AC.autosaveTimeout);
					}
				}
				else if (drawMsg.event == 'exit') 
				{
					removeDraft(function()
					{
			    		//revision is non-null if the diagram is saved
		    			AP.dialog.close(revision? {newRev: revision, newContentVer: contentVer, newContentId: contentId, newAspect: AC.aspect} : null);
					});
				}
				else if (drawMsg.event == 'save')
				{
					//Ignore all save events with no exist as they are handled by saving the draft file (similar to auto save)	
					if (!drawMsg.exit)
					{
						return;
					}
					
					diagramXml = drawMsg.xml;
					
					if (diagramName == null)
					{
						promptName('');
					}
					else
					{
						var aspectObj = AC.getAspectObj();
						editor.contentWindow.postMessage(JSON.stringify({action: 'export',
							format: 'png', spinKey: 'saving', scale: AC.hiResPreview? 2 : 1, withSvg: generateSVGs,
							pageId: aspectObj.pageId, layerIds: aspectObj.layerIds, message: drawMsg}));
					}
				}
				else if (drawMsg.event == 'prompt')
				{
					editor.contentWindow.postMessage(JSON.stringify({action: 'spinner',
						show: true, messageKey: 'inserting'}));

					checkName(drawMsg.value, function(name)
					{
						var aspectObj = AC.getAspectObj();
						
						editor.contentWindow.postMessage(JSON.stringify({action: 'spinner',
							show: false}));
						diagramName = name;
						diagramDisplayName = name;
						contentId = null;
						contentVer = null;
						AC.state.contentId = contentId;
						AC.state.contentVer = contentVer;
						AC.state.diagramName = name;
						editor.contentWindow.postMessage(JSON.stringify({action: 'export',
							format: 'png', spinKey: 'saving', scale: AC.hiResPreview? 2 : 1,
							pageId: aspectObj.pageId, layerIds: aspectObj.layerIds, withSvg: generateSVGs}));
					},
					function(name, err, errKey)
					{
						editor.contentWindow.postMessage(JSON.stringify({action: 'spinner',
							show: false}));
						promptName(name, err, errKey);
					});
				}
				else if (drawMsg.event == 'rename')
				{
					//If diagram name is not set yet, use the new name for both file and diagram
					//TODO should we disable renaming if diagramName is null?
					if (diagramName == null) 
					{
						editor.contentWindow.postMessage(JSON.stringify({action: 'spinner',
							show: true}));

						checkName(drawMsg.name, function(name)
						{
							editor.contentWindow.postMessage(JSON.stringify({action: 'spinner',
								show: false}));
							diagramName = name;
							AC.state.diagramName = name;
							diagramDisplayName = name;
						},
						function(name, err, errKey)
						{
							editor.contentWindow.postMessage(JSON.stringify({action: 'spinner',
								show: false}));
							editor.contentWindow.postMessage(JSON.stringify({action: 'dialog',
								titleKey: 'error', message: err, messageKey: errKey,
								buttonKey: 'ok'}));
						});	
					}
					else
					{
						diagramDisplayName = drawMsg.name;
					}
				}
				else if (drawMsg.event == 'export')
				{
					// Proceeds from sending the export message by saving the exported files
					var imageData = drawMsg.data.substring(drawMsg.data.indexOf(',') + 1);
					var svgData = drawMsg.svg;
					var diaWidth = drawMsg.bounds.width / drawMsg.scale;
					var diaHeight = drawMsg.bounds.height / drawMsg.scale;
					diagramDisplayName = (drawMsg.macroData != null && drawMsg.macroData.diagramDisplayName) ? drawMsg.macroData.diagramDisplayName : diagramDisplayName;

					function saveError(err) 
					{
						var key = null;
						var message = null;
						
						if (err.status == 409) 
						{
							diagramName = null;
							key = 'fileExists';
						}
						else if (err.status == 401)
						{
							// Session expired
							message = mxResources.get('confSessionExpired') +
								' <a href="' + baseUrl + '/pages/dashboard.action" target="_blank">' + mxResources.get('login') + '</a>';
						}
						else if (err.status == 400)
						{
							try
							{
								var errObj = JSON.parse(err.responseText);
								
								if (errObj.message.indexOf('Content body cannot be converted to new editor') > 0)
								{
									message = 'A Confluence Bug (CONFCLOUD-69902) prevented saving the page. Please edit the diagram from "Confluence Page Editor" where you can restore you changes from "File -> Revision history".';
								}	
							}
							catch(e){} //Ignore
						}
						else if (err.status == 403)
				        {
				        	key = 'errorSavingFileForbidden';
				        }
						else if (err.status == 413)
				        {
				        	key = 'confFileTooBigErr';
				        }

						var msg = {action: 'dialog', titleKey: 'error', modified: true, buttonKey: 'close'};
						
						if (message != null)
						{
							msg.message = message;
						}
						else
						{
							msg.messageKey = key || 'errorSavingFile';
						}
						
						editor.contentWindow.postMessage(JSON.stringify({action: 'spinner', show: false}));
						editor.contentWindow.postMessage(JSON.stringify(msg));
					};
					
					function successXml(responseText) 
					{
						var resp = null;
						revision = '1';
						
						//TODO Why this code (Is it expected to have incorrect responseText?)
						try
						{
							resp = JSON.parse(responseText);
						}
						catch (e)
						{
							// Ignores and use default value for revision
						}

						var spaceKey, pageTitle;
						// LATER: Get revision from metadata of attachment and check
						// what condition makes the response not contain an URL
						//TODO Is prev comment still needed with REST API?
						if (resp != null && resp.results != null && resp.results[0])
						{
							var attObj = AC.getLatestItem(resp.results);
							revision = attObj.version.number;
							diagramName = attObj.title; // When a file with untrimmed spaces is saved, the name is trimmed in the response
							AC.curDiagId = attObj.id;
							//Save/update the custom content
							spaceKey = AC.getSpaceKey(attObj._expandable.space);
							var pageType = attObj.container.type;
							pageTitle = attObj.container.title;

							AC.saveCustomContent(spaceKey, pageId, pageType, diagramName, diagramDisplayName, revision, 
									(AC.state.customContentMismatch? null : contentId), contentVer,
									function(responseText) 
									{
										var content = JSON.parse(responseText);
										
										contentId = content.id;
										contentVer = content.version? content.version.number : 1;
										AC.state.contentId = contentId;
										AC.state.contentVer = contentVer;

										AC.saveDiagram(pageId, diagramName + '.png', AC.b64toBlob(imageData, 'image/png'),
												successPng, saveError, false, 'image/png', mxResources.get('drawPrev'), false, draftPage);
									}, saveError, drawMsg.comments);
						}
						else
						{
							// Logs special case where save response has no URL
							try
							{
								var img = new Image();
								var message = 'Invalid Confluence Cloud response';
						    		img.src = '/images/2x2.png?msg=' + encodeURIComponent(message) +
					    				((responseText != null) ? '&resp=' + encodeURIComponent(responseText) : '&resp=[null]');
						    			'&url=' + encodeURIComponent(window.location.href);
							}
							catch (err)
							{
								// do nothing
							}
							
							//TODO Save png here in case responseText is incorrect (But why it can be incorrect?)
							AC.saveDiagram(pageId, diagramName + '.png', AC.b64toBlob(imageData, 'image/png'),
									successPng, saveError, false, 'image/png', mxResources.get('drawPrev'), false, draftPage);
						}

						function saveSvg()
						{
							// Save the SVG file and move to png success in all cases
							AC.saveDiagram(pageId, diagramName + '.svg', svgData, successPng, successPng,
									false, 'image/svg+xml', mxResources.get('drawSvgPrev'), false, draftPage);
							svgData = null;
						};

						function successPng(pngResponseText) 
						{
							if (svgData)
							{
								saveSvg();
								return;
							}

							try
							{
								// IMPORTANT: New macro parameters must be added to AC.macroParams to for adjustMacroParametersDirect to parse existing parameters correctly.
								var newMacroData = {
									diagramName: diagramName,
									diagramDisplayName: diagramDisplayName,
									revision: revision,
									pageId: newPage ? null : pageId,
									//pageInfo: spaceKey + ':' + pageTitle, // Currently, only used during migration from server to cloud. Removed once modified
									custContentId: contentId,
									contentVer: contentVer,
									baseUrl: baseUrl,
									width: diaWidth,
									height: diaHeight,
									tbstyle: (drawMsg.macroData != null && drawMsg.macroData.tbstyle) ? drawMsg.macroData.tbstyle : '',
									links: (drawMsg.macroData != null && drawMsg.macroData.links) ? drawMsg.macroData.links : '',
									simple: (drawMsg.macroData != null && drawMsg.macroData.simple != null) ? drawMsg.macroData.simple : '0',
									lbox: (drawMsg.macroData != null && drawMsg.macroData.lbox != null) ? drawMsg.macroData.lbox : '1',
									zoom: (drawMsg.macroData != null && drawMsg.macroData.zoom != null) ? drawMsg.macroData.zoom : '1',
									pCenter: (drawMsg.macroData != null && drawMsg.macroData.pCenter != null) ? drawMsg.macroData.pCenter : '0',
									inComment: AC.inComment? '1' : '0'
								};

								if (AC.aspect != null && AC.aspect !== 'undefined' && AC.aspect.length > 0)
								{
									newMacroData.aspect = AC.aspect;
								}
								
								//Set the hiResPreview only if the user set it in the UI which overrides the global settings
								if (drawMsg.macroData != null && drawMsg.macroData.hiResPreview != null)
								{
									newMacroData.hiResPreview = drawMsg.macroData.hiResPreview;									
								}
								
								// Add the new macro version parameter to new macros only (or ones already having it)
								if (AC.state.isNew || (drawMsg.macroData != null && drawMsg.macroData.mVer != null))
								{
									newMacroData.mVer = '2';
								}

								var finalizeSaving = function()
								{
									//We need to save macro in order for the live viewer in editor gets updated
									if (!AC.customContentEditMode && !AC.directEditMode)
									{
										AP.confluence.saveMacro(newMacroData);	
									}
									
									if (AC.autoExit || drawMsg.message == null || drawMsg.message.message == null || drawMsg.message.message.exit)
									{
										var savingCallback = function()
										{
											removeDraft(function()
											{
								    			AP.dialog.close({newRev: revision, newContentVer: contentVer, newContentId: contentId, newAspect: AC.aspect, newMacroData: newMacroData});
											});
										};
										
										//Save indexing text
										//Exit is done when the response is received!
										//This is needed for advanced search by draw.io diagrams type
										AC.remoteInvoke('getDiagramTextContent', null, null, function(textContent)
										{
											AC.saveContentSearchBody(contentId, diagramDisplayName + ' ' + textContent,
													savingCallback, savingCallback);	//ignore error and just exit
										}, savingCallback);
									}
									else
									{
										editor.contentWindow.postMessage(JSON.stringify({action: 'spinner', show: false}));
										editor.contentWindow.postMessage(JSON.stringify({action: 'status', message: '', modified: false}));
									}
								};

								
								
								if (AC.state.isNew) //New diagrams are saved with saveMacro since there is no macro in the page yet
								{
									AC.setFileDescriptor(drawMsg.desc, finalizeSaving, saveError);
								}
								else
								{
									AC.saveMacroToProp(AC.state.pageId, AC.state.diagramName, newMacroData, finalizeSaving, saveError);
								}
							}
							catch (e)
							{
								editor.contentWindow.postMessage(JSON.stringify({action: 'spinner', show: false}));
								editor.contentWindow.postMessage(JSON.stringify({action: 'dialog',
									titleKey: 'errorSavingFile', message: e.message, buttonKey: 'ok'}));
								
								console.log(e);
								AC.logError(e.message, null, null, null, e);
							}
						};
					};

					if (diagramName != null) 
					{
						editor.contentWindow.postMessage(JSON.stringify({action: 'spinner',
							show: true, messageKey: 'saving'}));
						
						AC.saveDiagram(pageId, diagramName, diagramXml,
							successXml, saveError, false, 'application/vnd.jgraph.mxfile', mxResources.get('drawDiag'), false, draftPage);
					}
				}
				else if (drawMsg.event == 'remoteInvoke')
				{
					AC.handleRemoteInvoke(drawMsg);
				}
				else if (drawMsg.event == 'remoteInvokeResponse')
				{
					AC.handleRemoteInvokeResponse(drawMsg);
				}
			}
		};

		window.addEventListener('message', messageListener);
		editor.contentWindow.postMessage(JSON.stringify({action: 'remoteInvokeReady'}));
		AC.remoteWin = editor.contentWindow;
	};
	
	// Refresh config if needed
	if (refreshConfig)
	{
		AC.getConfig(AC.noop, AC.noop, false, function(newConfig) 
		{
			// TODO Currently we don't have any config that needs to be refreshed
			editor.contentWindow.postMessage(JSON.stringify({action: 'status', message: mxResources.get('configUpdated'), modified: false}));
		});
	}
};

AC.saveMacroToProp = AC.contentTypeFnWrapper(function (pageId, diagramName, macroData, onSuccess, onError)
{
	function saveMacroProp(content, id, ver)
	{
		AC.setContentProperty(pageId, AC.contentTypeCache[pageId].type, id, AC.MACRO_EDITS_PROP, 
				encodeURIComponent(JSON.stringify(content)), ver, onSuccess, function(err)
				{
					if (err.status == 409) //On conflict, try again to catch concurrent changes
					{
						AC.saveMacroToProp(pageId, diagramName, macroData, onSuccess, onError);
					}
					else
					{
						onError();
					}
				});
	};
	
	var propContent = {};
	
	AC.getContentProperty(pageId, AC.contentTypeCache[pageId].type, AC.MACRO_EDITS_PROP, function(resp)
    {
		resp = JSON.parse(resp);
		var propVer = resp.version.number;
		var propId = resp.id;

		try
		{
			propContent = JSON.parse(decodeURIComponent(resp.value));

			AC.log('getContentProperty', 'pageId', pageId,
				'propContent', [propContent]);
		}
		catch(e) //Ignore errors, incorrect format, so just create a new one
		{
			console.log(e);
			AC.logError(e.message, null, null, null, e);
		}
		
		if (macroData.revision && propContent[diagramName] && macroData.revision < propContent[diagramName].revision)
		{
			onError({msg: 'version downgraded', downgrade: true});
			return;
		}
		
		propContent[diagramName] = macroData;
		saveMacroProp(propContent, propId, propVer);
    }, function(err)
	{
		//Property not found, add it. Any other error -> save failed
		AC.log('getContentProperty',
			'pageId', pageId,
			'err', [err]);

		if (err.status == 404)
		{
			propContent[diagramName] = macroData;
			saveMacroProp(propContent);
		}
		else
		{
			onError();
		}
	});
});

AC.getPageIdFromPageInfo = function(pageInfo, success, error)
{
	var colonIndex = pageInfo.indexOf(':');
	var spaceKey = pageInfo.substring(0, colonIndex);
	var pageName = pageInfo.substring(colonIndex + 1);

	if (!spaceKey)
	{
		AP.context.getContext(function(data)
		{
			if (data.confluence)
			{
				AC.getPageId(data.confluence.space.id, pageName, success, error);
			}
			else
			{
				// Context doesn't work in old editor!
				AP.getLocation(function(loc)
				{
					AC.getSpaceId(AC.getSpaceKey(loc), function(spaceId)
					{
						AC.getPageId(spaceId, pageName, success, error);
					}, error);
				});
			}
		});
	}
	else if (spaceKey.indexOf('$$$') == 0)
	{
		AC.getPageId(spaceKey.substring(3), pageName, success, error);
	}
	else
	{
		AC.getSpaceId(spaceKey, function(spaceId)
		{
			AC.getPageId(spaceId, pageName, success, error);
		}, error);
	}
};

AC.loadDiagram = function (pageId, diagramName, revision, success, error, owningPageId, tryRev1, pageInfo) 
{
	var curDiagName = diagramName;
	var curPageId = pageId;
	// TODO: Get binary
	
	//keeping the block of AP.require to minimize the number of changes!
	{
		var localSuccess = function(resp)
		{
			success(resp, curPageId, curDiagName);
		}
		
		AP.request({
			//TODO find out the ID of the page that actually holds the attachments because historical revisions do not have attachments
			url: '/download/attachments/' + pageId + '/' + encodeURIComponent(diagramName) +
				(revision? '?version=' + revision : ''),
			success: localSuccess,
			error : function(resp) 
			{
				// Try pageInfo if exists (At this point, the current page does not have the diagram)
				if (pageInfo != null)
				{
					AC.getPageIdFromPageInfo(pageInfo, function(pageId)
					{
						AC.loadDiagram(pageId, diagramName, revision, success, error, null, tryRev1, null);
					}, error);
				}
				//Remove spaces in the diagram name
				else if (resp.status == 404 && diagramName != diagramName.trim())
				{
					AC.loadDiagram(pageId, diagramName.trim(), revision, success, error, owningPageId, tryRev1);
				}
				//When a page is copied, attachments are reset to version 1 while the revision parameter remains the same
				else if (tryRev1 && ((revision > 1 && resp.status == 404) || (revision >= 1 && resp.status == 403)))
				{
					AP.request({
						url: '/download/attachments/' + pageId + '/' + encodeURIComponent(diagramName),
						success: localSuccess,
						error : function(resp) { //If revesion 1 failed, then try the owningPageId
							if (owningPageId && resp.status == 404)
							{
								curPageId = owningPageId;
								AP.request({
									url: '/download/attachments/' + owningPageId + '/' + encodeURIComponent(diagramName)
										+'?version=' + revision, //this version should exists in the original owning page
									success: localSuccess,
									error : error
								});
							}
							else
							{
								error(resp);
							}
						}
					});
				}
				else if (owningPageId && (resp.status == 404 || resp.status == 403)) //We are at revesion 1, so try the owningPageId directly
				{
					curPageId = owningPageId;
					AP.request({
						url: '/download/attachments/' + owningPageId + '/' + encodeURIComponent(diagramName),
						success: localSuccess,
						error : error
					});
				}
				else
				{
					error(resp);
				}
			}
		});
	};
};

AC.decodeHtml = function(html)
{
    var txt = document.createElement("textarea");
    txt.innerHTML = html;
    return txt.value;
};

AC.findMacroInPageObj = function(page, diagramName, lastMacroVer, success, getAll, embedMacro, contentId, sketchMacro, macroId)
{
	var originalBody = page.body.storage.value;
    		
	var foundMacros = originalBody.match(sketchMacro? AC.findSketchMacrosRegEx : (embedMacro? AC.findEmbedMacrosRegEx : AC.findMacrosRegEx));

	var macroFound = false;
	var matchingMacros = [];
	
	for (var i = 0; foundMacros != null && i < foundMacros.length; i++)
	{
		if (!getAll)
		{
			var macroDiagName = foundMacros[i].match(AC.findMacroParamRegEx["diagramName"]);
			var macroRevision = foundMacros[i].match(AC.findMacroParamRegEx["revision"]);
			var macroContentId = foundMacros[i].match(AC.findMacroParamRegEx["custContentId"]);
			var macroMacroId = foundMacros[i].match(AC.findMacroParamRegEx['macroId']);
		}

		if (getAll || 
			  (macroId != null && macroMacroId != null && macroMacroId[1] == macroId) ||
			  (embedMacro && macroContentId != null && macroContentId[1] == contentId) ||
			  (macroDiagName != null && AC.decodeHtml(macroDiagName[1]) == diagramName && 
				(lastMacroVer == false || (macroRevision != null && macroRevision[1] == lastMacroVer))))
		{
			var macroParams = {};
			
			for (var j = 0; j < AC.macroParams.length; j++)
			{
				var param = AC.macroParams[j];
				var val = foundMacros[i].match(AC.findMacroParamRegEx[param]);
				
				if (val != null)
				{
					if (param == 'pageInfo')
					{
						try
						{
							var spaceKey = val[1].match(AC.findMacroParamRegEx['pageInfo:SpaceKey']);
							var pageTitle = val[1].match(AC.findMacroParamRegEx['pageInfo:PageTitle']);
							macroParams[param] = AC.decodeHtml(spaceKey? spaceKey[1] : AC.getSpaceKey(page._links.webui)) + 
												':' + AC.decodeHtml(pageTitle? pageTitle[1] : page.title);
						}
						catch(e) {} // Ignore if format is wrong
					}
					else
					{
						macroParams[param] = AC.decodeHtml(val[1]);
					}
				}
			}
			
			matchingMacros.push({macro: foundMacros[i], macroParams: macroParams});
			macroFound = true;
		}
	}
	
	success(macroFound, originalBody, matchingMacros, page);
};

AC.findMacroInPage = AC.contentTypeFnWrapper(function(pageId, diagramName, lastMacroVer, success, error, draftPage, getAll, embedMacro, contentId, sketchMacro, macroId)
{
	//load the page to edit the macro
	AP.request({
		type: 'GET',
		url: '/api/v2/' + (AC.contentTypeCache[pageId].isBP? 'blogposts' : 'pages') + '/' + pageId + '?body-format=storage' + (draftPage ? '&get-draft=true' : ''),
		contentType: 'application/json;charset=UTF-8',
		success: function (resp) 
		{
			var page = JSON.parse(resp);
			AC.findMacroInPageObj(page, diagramName, lastMacroVer, success, getAll, embedMacro, contentId, sketchMacro, macroId);
		},
		error: error
	});
}, 0, 4);

//From https://www.edutechional.com/2018/09/28/how-to-check-if-two-javascript-objects-have-the-same-values/
AC.isEqual = function (obj1, obj2)
{
  var obj1Keys = Object.keys(obj1);
  var obj2Keys = Object.keys(obj2);

  if (obj1Keys.length !== obj2Keys.length) 
  {
    return false;
  }

  for (var i = 0; i < obj1Keys.length; i++) 
  {
	var objKey = obj1Keys[i];
	
    if (obj1[objKey] != obj2[objKey]) //Weak compare since sometimes the macro params are number or string 
    {
      return false;
    }
  }

  return true;
};

//FIXME Confluence adjust macros in draft such that there is no way to adjust the content of drafts currently! So, drafts code is removed
AC.adjustMacroParametersDirect = AC.contentTypeFnWrapper(function(pageId, macrosData, originalBody, matchingMacros, page, success, error, macroId, keepPageInfo)
{
	var changed = false, partialError = false, modDiagName = null;
	
	for (var i = 0; i < matchingMacros.length; i++)
	{
		var macroData = null;
		//If macro id is provided and doesn't match, skip this one
		if (macroId != null)
		{
			if (macroId == matchingMacros[i].macroParams.macroId)
			{
				macroData = macrosData;
			}
			else
			{
				continue;
			}
		} 
		else
		{
			macroData = macrosData[AC.decodeHtml(matchingMacros[i].macroParams['diagramName'])];
		}
		
		delete matchingMacros[i].macroParams.macroId;
		
		if (macroData != null && !AC.isEqual(macroData, matchingMacros[i].macroParams))
		{
			//Prevent macro version downgrading
			if (macroData.revision && macroData.revision < matchingMacros[i].macroParams.revision)
			{
				if (partialError)
				{
					partialError.count++;
				}
				else
				{
					partialError = {msg: 'version downgraded', downgrade: true, count: 1};
				}
				
				continue;
			}
			
			AC.log('Macro is updated ' + matchingMacros[i].macroParams['diagramName']);
			modDiagName = AC.decodeHtml(matchingMacros[i].macroParams['diagramDisplayName'] || matchingMacros[i].macroParams['diagramName']);
			var modMacro = matchingMacros[i].macro;

			for (var param in macroData) 
			{
				var pRegEx = AC.findMacroParamRegEx[param];
				
				//This to avoid errors if a new parameter/key is added to the macro and is not in the macro regexps
				if (pRegEx == null || param == 'macroId') continue;
				
				var newParamVal = '<ac:parameter ac:name="'+ param +'">' + AC.htmlEntities(macroData[param]);
				
				//If parameter exists, change it. Otherwise, add it
				if (modMacro.match(pRegEx))
				{
					if (param == 'pageInfo')
					{
						if (keepPageInfo)
						{
							var parts = macroData[param].split(':');
							newParamVal = '<ac:parameter ac:name="'+ param +'"><ac:link><ri:page ri:space-key="' +
											AC.htmlEntities(parts[0]) + '" ri:content-title="' + 
											AC.htmlEntities(parts[1]) + '" />';
						}
						else
						{
							newParamVal = '<ac:parameter ac:name="">'; // Remove the parameter
						}
					}

					modMacro = modMacro.replace(pRegEx, newParamVal);
				}
				else
				{
					modMacro += newParamVal + "</ac:parameter>";
				}
			}
			
			originalBody = originalBody.replace(matchingMacros[i].macro, modMacro);
			changed = true;
		}
	}
	
	if (changed)
	{
		AC.alert('before updating the page');
		AC.log('Page is updating in adjust page');
		var updatePage = {
			id: page.id,
			status: 'current',
			title: page.title,
			body: {
				representation: 'storage',
				value: originalBody
			},
			version: {
				number: page.version.number + 1,
				message: modDiagName? mxResources.get('diagramEdited', ['draw.io', modDiagName]) : ''
			}
		};

		AP.request({
			type: 'PUT',
			data: JSON.stringify(updatePage),
			url:  '/api/v2/' + (AC.contentTypeCache[pageId].isBP? 'blogposts' : 'pages') + '/' + pageId,
			contentType: "application/json;charset=UTF-8",
			success: function(resp)
			{
				if (partialError)
				{
					error(partialError);
				}
				else
				{
					success(resp);
				}
			},
            error: error
		});
	}
	else if (partialError)
	{
		error(partialError);
	}
	else
	{
		AC.log('No Changes found for asjusting page');
		success(false);
	}
}, 0, 6);

AC.updatePageEmbedMacros = function(pageId, updatedMacros, success, error, macroId)
{
	AC.findMacroInPage(pageId, null, null, function(macroFound, originalBody, matchingMacros, page)
	{
    	if (macroFound)
		{
			AC.adjustMacroParametersDirect(pageId, updatedMacros,
					originalBody, matchingMacros, page, success, error, macroId);
		}
		else
		{
			error();
		}
	}, error, false, true, true);
};

AC.isMacroDuplicate = AC.contentTypeFnWrapper(function(pageId, diagramName, isSketch, fromPageEditor, success)
{
	AP.request({
		type: 'GET',
		// Request draft content when checking the page editor version of the page. If direct edit, check published version
		url: '/api/v2/' + (AC.contentTypeCache[pageId].isBP? 'blogposts' : 'pages') + '/' + pageId + '?body-format=storage' + (fromPageEditor? '&get-draft=true' : ''),
		contentType: 'application/json;charset=UTF-8',
		success: function (resp) 
		{
			var page = JSON.parse(resp);
			
			//find all macros and check if diagram name (attachment) is used more than once
			var foundMacros = page.body.storage.value.match(isSketch? AC.findSketchMacrosRegEx : AC.findMacrosRegEx);
			var matches = 0;
			
			for (var i = 0; foundMacros != null && i < foundMacros.length; i++)
			{
				var macroDiagName = foundMacros[i].match(AC.findMacroParamRegEx['diagramName']);
				
				if (macroDiagName != null && AC.decodeHtml(macroDiagName[1]) == diagramName)
				{
					matches++;
				}
			}
			
			if (matches > 1)
			{
				success();
			}
		},
		error : AC.noop
	});
}, 0, 1000); // 1000 since this function has no error and 1000 will get undefined and nothing is called on error

AC.refreshUrlWithNewParams = function(newSettings, addedParams)
{
	addedParams = addedParams || {};
	var paramsMapping = {
		displayName: 'diagramDisplayName',
		hiRes: 'hiResPreview',
		GHPriv: 'GHIsPrivate'
	};
	
	//Build the new url with new macro settings
	var params = location.search.substr(1).split('&');
	var newParams = [];
	
	for (var k = 0; k < params.length; k++)
	{
		var parts = params[k].split('=');
		var key = paramsMapping[parts[0]]? paramsMapping[parts[0]] : parts[0];
		
		if (newSettings[key] != null)
		{
			newParams.push(parts[0] + '=' + encodeURIComponent(newSettings[key]));
		}
		else
		{
			newParams.push(params[k]);
		}
	}
	
	for (var p in addedParams)
	{
		newParams.push(p + '=' + encodeURIComponent(addedParams[p]));
	}
	
	location.href = location.origin + location.pathname + '?' + newParams.join('&');	
};

AC.updatePageMacros = AC.contentTypeFnWrapper(function(pageId, pendingUpdates, pendingUpdatesId, pendingUpdatesVer, myLock, callback)
{
	callback = callback != null? callback : AC.noop;
	
	function retry()
	{
		AC.alert('Pause before retrying');
		AC.log('Retrying updating page');
		AC.getContentProperty(pageId, AC.contentTypeCache[pageId].type, AC.MACRO_EDITS_PROP, function(resp)
	    {
			try
			{
				resp = JSON.parse(resp);
				AC.updatePageMacros(pageId, JSON.parse(decodeURIComponent(resp.value)), resp.id, resp.version.number, myLock, callback);
			}
			catch(e) //Ignore errors, incorrect format, so just create a new one
			{
				console.log(e);
				AC.logError(e.message, null, null, null, e);
				callback();
			}
		}, callback);
	};
	
	//We reset the property if no macros found in the page or some matched and fixed (TODO Is that correct or we should verify no change is needed)
	function resetProp(pendingUpdatesVer)
	{
		AC.log('Resetting property');
		//Clean property and remove lock
		AC.setContentProperty(pageId, AC.contentTypeCache[pageId].type, pendingUpdatesId, AC.MACRO_EDITS_PROP, encodeURIComponent(JSON.stringify({})), 
				pendingUpdatesVer, callback, callback);
	};
	
	//Go over all macros in the page, if pending updates have changes, add it
	//We use 409 error to confirm no other concurrent write occurred 
	//Property is locked (with timeout such that lock is released after a certain time [5 min])
	var lockTS = pendingUpdates[AC.LOCK_TS_NAME];
	AC.alert('Pause before lock check');
	if (lockTS && (myLock != lockTS && Date.now() - lockTS < 300000))
	{
		AC.log('Prop is Locked, aborting update');
		callback();
		return;
	}
	
	//Acquire the lock
	myLock = Date.now();
	pendingUpdates[AC.LOCK_TS_NAME] = myLock;
	
	AC.setContentProperty(pageId, AC.contentTypeCache[pageId].type, pendingUpdatesId, AC.MACRO_EDITS_PROP, 
		encodeURIComponent(JSON.stringify(pendingUpdates)), pendingUpdatesVer, function()
		{
			AC.alert('Pause after lock & before changing page');
			pendingUpdatesVer++;
			AC.log('Prop locked successfully');
			
			AC.findMacroInPage(pageId, null, null, function(sketchMacroFound, originalBody, matchingSkwtchMacros, page)
    		{
				AC.findMacroInPageObj(page, null, null, function(macroFound, originalBody, matchingMacros, page)
	    		{
					matchingMacros = matchingMacros.concat(matchingSkwtchMacros);
					
	            	if (macroFound || sketchMacroFound)
	        		{
						AC.log('Found macros - ' + matchingMacros.length);
						AC.adjustMacroParametersDirect(pageId, pendingUpdates,
								originalBody, matchingMacros, page, function()
						{
							resetProp(pendingUpdatesVer);
						}, function(err) //On error, it means the page is a newly created draft that is not published
			    		{
							AC.log('Updating page error ' + err.status);
			    			if (err.status == 409) //On conflict, try again to catch concurrent changes
							{
								retry();
							}
							else if (err.downgrade)
							{
								//If a downgrade happen, remove the property
								//TODO should we report this error?
								resetProp(pendingUpdatesVer);
							}
			    		});
	        		}
					else
					{
						resetProp(pendingUpdatesVer);
					}
	    		}, true);
    		}, callback, false, true, null, null, true);
		}, 
		function(err)
		{
			AC.log('Updating prop error (cannot lock) ' + err.status);
			if (err.status == 409) //On conflict, try again to catch concurrent changes
			{
				retry();
			}
			else
			{
				callback();
			}
		});
});

AC.saveCustomContent = function(spaceId, pageId, pageType, diagramName, diagramDisplayName, revision, contentId, contentVer, success, error, comments, reportAllErr, extraInfo)
{
	//Make sure comments are not lost
	if (comments == null)
	{
		AC.getOldComments(contentId, function(comments)
		{
			AC.saveCustomContent(spaceId, pageId, pageType, diagramName, diagramDisplayName, revision, contentId, contentVer, success, error, comments, reportAllErr, extraInfo);
		}, 
		//On error, whether the custom content is deleted or corrupted. It is better to proceed with saving and losing the comments than losing the diagram
		function()
		{
			AC.saveCustomContent(spaceId, pageId, pageType, diagramName, diagramDisplayName, revision, contentId, contentVer, success, error, [], reportAllErr, extraInfo);
		});
		
		return;
	}
	
	var info = {
	    "pageId": pageId,
		"type": pageType,
	    "diagramName": diagramName,
	    "version": AC.isUploadMode? null : revision,
	    "inComment": AC.inComment,
	    "comments": comments || [],
		"isSketch": AC.isSketch? 1 : 0 
	};

	if (extraInfo)
	{
		for (var key in extraInfo)
		{
			info[key] = extraInfo[key];
		}
		
		info.custom = true;
	}
	
    var customObj = {
        type: 'ac:' + AC.macroType,
        //spaceId: spaceId, // TODO Not required?
        title: diagramDisplayName,
        body: {
			value: encodeURIComponent(JSON.stringify(info)),
			representation: 'storage'
        },
        status: 'current'
    };
    
	if (pageType == 'blogpost')
	{
		customObj.blogPostId = pageId;
	}
	else
	{
		customObj.pageId = pageId;
	}

    if (contentId)
    {
		customObj.id = contentId;
        customObj.version = {
            number: ++contentVer
        };
    }
    
	AP.request({
		type: contentId? 'PUT' : 'POST',
		data: JSON.stringify(customObj),
		url:  '/api/v2/custom-content' + (contentId? '/' + contentId : ''),
		contentType: 'application/json;charset=UTF-8',
		success: success,
		error: function(resp) 
		{
			if (reportAllErr)
			{
				error(resp);
				return;
			}
			
			//User can delete a custom content externally and we will get error 403 and message will contain the given id
			//Then save a new one
			var err = {};
			
			try
			{
				err = JSON.parse(resp.responseText);
			}
			catch (e){} // ignore

			//Sometimes the macro is not updated such that the version is not correct. The same happens when a page version is restored
			if (err.statusCode == 409 && err.message.indexOf("Current version is:") > 0)
			{
				//We will use the error message to detect the correct version instead of doing another request. 
				//It should be safe as long as error messages are not translated or changed
				var curContentVer = err.message.match(/\d+/);
				
				if (curContentVer != null)
				{
					AC.saveCustomContent(spaceId, pageId, pageType, diagramName, diagramDisplayName, revision, contentId, curContentVer[0], success, error, comments, false, extraInfo);
				}
			}
			//Sometimes, when a page is copied or site is cloned, custom contents are lost, so create a new one
			//For example, error 400: When a page is moved to another space, an error occur since the original  custom content belong to another space/page
			else if (contentId != null)
			{
				AC.saveCustomContent(spaceId, pageId, pageType, diagramName, diagramDisplayName, revision, null, null, success, error, comments, false, extraInfo);
			}
			else
			{
				error(resp);
			}
		}
	});
};

AC.saveContentSearchBody = function(contentId, searchBody, success, error)
{
	if (searchBody && searchBody.length > 32000)
	{
		searchBody = searchBody.substring(0, 32000); // Confluence has a limit of 32KB for property values
	}

	var doSaveSearchBody = function(id, version)
	{
		AC.setContentProperty(contentId, 'custom-content', id, 'ac:custom-content:search-body', searchBody, version, success, error);
	};
	
	
	AC.getContentProperty(contentId, 'custom-content', 'ac:custom-content:search-body', function(resp)
    {
		resp = JSON.parse(resp);
      
		if (searchBody == resp.value) //Nothing changed, so just return
		{
			success();
		}
		else
		{
			doSaveSearchBody(resp.id, resp.version.number);
		}
    },
    function(resp)
    {
		try
		{
			var err = JSON.parse(resp.responseText);
		
			//if not found, create one
			if (err.statusCode == 404)
			{
				doSaveSearchBody();
			}
			else
				error();
		}
		catch(e)
		{
			error();
		}
    });
};

//TODO We can upload both the diagram and its png in one call if needed?
AC.saveDiagram = function(pageId, diagramName, xml, success, error, newSave, mime, comment, sendNotif, draftPage, delOldDraft) 
{
	function loadSucess(resp) 
	{
		error({status: 409, message: mxResources.get('fileExists')});
	};
	
	function loadError(resp)
	{
		if (resp.status == 404) // file under given name does not exist means we can proceed with saving 
		{
			doSave();
		}
		else 
		{
			error({status: resp.status, message : resp.statusText });
		}
	};
	
	var sessionCheck = function(responseText)
	{
		if (responseText != null)
		{
			var obj = JSON.parse(responseText);
			
			if (obj != null) 
			{
				if (obj.code == -32600) //TODO is the codes the same with new REST APIs)
				{
					error({status: 401});
					
					return;	
				}
				
				if (delOldDraft && obj.results && obj.results[0])
				{
					obj = AC.getLatestItem(obj.results);
					var curVer = obj.version.number;
					
					if (curVer > AC.draftsToKeep)
					{
						AP.request({
							type: 'DELETE',
							url:  '/rest/api/content/' + obj.id + '/version/' + (curVer - AC.draftsToKeep)
						 });
					}
				}
			}
		}
		
		success(responseText);
	}
	
	doSave = function() 
	{
		//keeping the block of AP.require to minimize the number of changes!
		{
			 var attFile = (xml instanceof Blob)? xml : new Blob([xml], {type: mime});
			 attFile.name = diagramName;
			 
			 var reqData = {file: attFile, minorEdit: !sendNotif};
			 var draft = draftPage ? "?status=draft" : "";
			 AC.log('saveDiagram.doSave', 'pageId', pageId,
			 	'reqData', [reqData]);

			 if (comment != null)
			 {
				 reqData.comment = comment;
			 }
			 
			 AP.request({
				type: 'PUT',
				data: reqData,
				url:  "/rest/api/content/"+ pageId +"/child/attachment" + draft,
				contentType: "multipart/form-data",
				success: sessionCheck,
				error: function(err)
				{
					if (draftPage && err.status == 404 && err.responseText.indexOf('there is a content object with status : current') > 0)
					{
						AC.saveDiagram(pageId, diagramName, xml, success, error, newSave, mime, comment, sendNotif, false, delOldDraft);
					}
					else if (error)
					{
						error(err);
					}
				}
			 });
		};
	};
	
	if(newSave && mime == 'application/vnd.jgraph.mxfile')
	{
		this.loadDiagram(pageId, diagramName, 0, loadSucess, loadError);
	}
	else 
	{
		doSave();
	}
};

AC.removeDraft = function(pageId, filename, user, callback)
{
	if (pageId != null && filename != null)
	{
		//If new draft, delete it physically
		if (filename.indexOf('~drawio~' + user + '~') == 0)
		{
			AC.getAttachmentInfo(pageId, filename, false, function(info)
			{
				AP.request({
			        url : '/api/v2/attachments/' + info.id,
			        type : 'DELETE',
			        success : callback,
			        error : callback
			    });
			}, 
			callback);
		}
		else //Currently, we don't remove draft as it is used in collab. We can use this for detecting user exited 
		{
			if (callback) 
			{
				callback();
			}
		}
	}
	else if (callback != null)
	{
		callback();
	}
};

AC.getMacroData = function(fn) 
{
	AP.confluence.getMacroData(fn);
}

//From mxUtils
AC.htmlEntities = function(s, newline)
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

AC.fromHtmlEntities = function(str)
{
    var doc = new DOMParser().parseFromString(str || '', "text/html");
    return doc.documentElement.textContent;
};

AC.getCustomLibrariesPages = function(teamsMap, callback, error)
{
	var teamsPages = [];

	// TODO This is limited to 150 teams (pages)
	AP.request({
		type: 'GET',
		url: '/rest/api/content/search?cql=type%3Dpage%20and%20space%3DDRAWIOCONFIG%20and%20title~Libraries*&limit=250', //type=page and space=DRAWIOCONFIG and title~Libraries*. Search doesn't return 404 if not found
		contentType: 'application/json;charset=UTF-8',
		success: function (resp) 
		{
			resp = JSON.parse(resp);

			for (var i = 0; i < resp.size; i++)
			{
				var page = resp.results[i];
				var title = page.title;

				if (title.substring(0, 9) == 'Libraries')
				{
					var teamName = title.substring(10);

					if (teamName == '' || teamsMap[teamName] != null)
					{
						teamsPages.push({pageId: page.id, teamName: teamName});
					}
				}				
			}

			callback(teamsPages);
		},
		error: error
	});
};

AC.getCustomLibraries = function(callback, error)
{
	var teamsPages = [], ret = [], done = 0;
	
	function checkDone()
	{
		done++;

		if (done == teamsPages.length)
		{
			// Keep libraries alphabetically sorted (TODO group by team)
			ret.sort(function(a, b)
			{	
				if (a.title > b.title)
				{
					return 1;
				}
				else if (a.title < b.title)
				{
					return -1;
				}
				
				return 0;
			});

			callback(ret);
		}
	}

	function getPageLibs(teamName, pageId)
	{
		AC.getPageAttachments(pageId, function(attachments)
		{
			for (var j = 0; j < attachments.length; j++)
			{
				var obj = attachments[j];

				ret.push({
					id: obj.id, 
					title: obj.title, 
					downloadUrl: obj._links? obj._links.download : null,
					team: teamName
				});
			}

			checkDone();
		});
	}

	AC.getCurrentUserTeams(function(teams, user, teamsMap)
	{
		AC.getCustomLibrariesPages(teamsMap, function(pages)
		{
			teamsPages = pages;

			if (teamsPages.length == 0)
			{
				callback([]);
			}
			else
			{
				for (var i = 0; i < teamsPages.length; i++)
				{
					getPageLibs(teamsPages[i].teamName, teamsPages[i].pageId);
				}
			}
		}, error);
	}, error);
};

AC.getFileContent = function(url, callback, error)
{
	AC.getFileContentAsIs(url.replace(/\?.*/, ''), callback, error)
};

AC.getFileContentAsIs = function(url, callback, error)
{
	AP.request({
        type: 'GET',
		url: url,
        contentType: 'text/xml;charset=UTF-8',
        success: callback,
		error: error
	});
};

AC.getCurrentUser = function(callback, error)
{
	var baseUrl = AC.getBaseUrl();
	
	AP.request({
        type: 'GET',
		url: '/rest/api/user/current',
		contentType: 'application/json;charset=UTF-8',
        success: function (resp) 
        {
        	resp = JSON.parse(resp);
        	
        	callback({
        		id: resp.accountId,
        		username: resp.username,
        		email: resp.email,
        		displayName: resp.displayName,
        		pictureUrl: resp.profilePicture? baseUrl.substr(0, baseUrl.lastIndexOf('/')) + resp.profilePicture.path : null
        	}); 
		},
		error: error
	});
};

AC.RESOLVED_MARKER = '$$RES$$ ';
AC.REPLY_MARKER = '$$REP$$';
AC.REPLY_MARKER_END = '$$ ';
AC.DELETED_MARKER = '$$DELETED$$';
AC.COMMENTS_INDEX_PROP = 'commentsAttVerIndex';

//TODO This is not needed now as we wait until we get the attachment id. REMOVE
//TODO Use of globals is risky and error-prone. Find another way to get attachment id and version? 
AC.commentsFnWrapper = function(fn, noErrCheck)
{
	//Wait for attId and ver to be ready
	function wrappedFn()
	{
		if (AC.curDiagId == false && !noErrCheck)
		{
			//Call error (last argument)
			arguments[arguments.length - 1]();
		}
		else if (AC.curDiagId != null)
		{
			fn.apply(this, arguments);
		}
		else
		{
			var fnArgs = arguments;
			//Wait
			setTimeout(function()
			{
				wrappedFn.apply(this, fnArgs);
			}, 300);
		}
	}
	
	return wrappedFn;
};

AC.getComments = AC.commentsFnWrapper(function(attVer, checkUnresolvedOnly, success, error)
{
	function isResolvedComment(atlasComment)
	{
		if (atlasComment.children != null)
		{
			var lastReply = atlasComment.children.pop();
			
			if (lastReply != null && decodeURIComponent(lastReply.body.storage.value).indexOf(AC.RESOLVED_MARKER) == 0)
			{
				return true;
			}
			else
			{
				return false;
			}
		}
		else
		{
			return false;
		}
	};
	
	var attId = AC.curDiagId;
	attVer = attVer || AC.curDiagVer;
	
	var confComments = [], remaining;
	
	if (attId)
	{
		AC.getCommentsAttVersIndex(attId, function()
		{
			remaining = AC.curCommentIndex.length;
			doNextChunk();
			indexIntegrityCheck();
		}, function()
		{
			//No index found, means no comments hence no unresolved comments
			if (checkUnresolvedOnly)
			{
				success(false);
				return;
			}
			
			indexIntegrityCheck(function()
			{
				remaining = AC.curCommentIndex.length;
				doNextChunk();
			}, error);
		});
		
		function indexIntegrityCheck(callback, error)
		{
			if (checkUnresolvedOnly && callback == null) return;
				
			AC.getAttVersWithComments(attId, attVer, function(vers, versMap)
			{
				var matches = 0;
				
				for (var i = 0; i < AC.curCommentIndex.length; i++)
				{
					if (versMap[AC.curCommentIndex[i]])
					{
						matches++;
					}
				}
    			
				if (matches != vers.length || AC.curCommentIndex.length != vers.length)
				{
					AC.curCommentIndex = vers;
					AC.setCommentsAttVersIndex(attId, vers);
				}
				
				if (callback)
				{
					callback();
				}
    		}, 
    		function()
    		{
    			console.log('Error while checking integrity of comments index for ' + attVer); //TODO What to do when integrity call fails?
    			
    			if (error)
    			{
    				error();
    			}
    		});
		};
		
		function doGetComments(ver, callback, error)
		{
			var childCount = 0;

			function findUsernames()
			{
				var userIds = {};

				for (var i = 0; i < confComments.length; i++)
				{
					userIds[confComments[i].version.authorId] = true;

					if (confComments[i].children != null)
					{
						for (var j = 0; j < confComments[i].children.length; j++)
						{
							userIds[confComments[i].children[j].version.authorId] = true;
						}
					}
				}

				AP.request({
					url : '/rest/api/user/bulk?accountId=' + Object.keys(userIds).join('&accountId='),
					type : 'GET',
					success : function(users) 
					{
						users = JSON.parse(users).results;

						for (var i = 0; i < users.length; i++)
						{
							userIds[users[i].accountId] = users[i];
						}

						for (var i = 0; i < confComments.length; i++)
						{
							confComments[i].author = userIds[confComments[i].version.authorId];

							if (confComments[i].children != null)
							{
								for (var j = 0; j < confComments[i].children.length; j++)
								{
									confComments[i].children[j].author = userIds[confComments[i].children[j].version.authorId];
								}
							}
						}

						callback();
					},
					error : callback // Ignore errors (TODO Is this OK?)
				}); 
			}

			function checkDone(notDecrement)
			{
				if (notDecrement !== true)
				{
					childCount--;
				}
				
				if (childCount == 0)
				{
					if (checkUnresolvedOnly)
					{
						for (var i = 0; i < confComments.length; i++)
						{
							if (!isResolvedComment(confComments[i]))
							{
								success(true);
								return;
							}
						}
					}
					else
					{
						findUsernames();
					}
				}
			}

			function collectChildren(comment)
			{
				AP.request({
					url : '/api/v2/footer-comments/' + comment.id + 
							'/children?limit=250&body-format=storage',
					type : 'GET',
					success : function(comments) 
					{
						comment.children = JSON.parse(comments).results;
						checkDone();
					},
					error : checkDone // Ignore errors (TODO Is this OK?)
				}); 
			}

			AP.request({
		        url : '/api/v2/attachments/' + attId + 
		        		'/footer-comments?limit=250&body-format=storage&version=' + ver,
		        type : 'GET',
		        success : function(comments) 
		        {
		        	comments = JSON.parse(comments).results;
					childCount = comments.length;

		        	for (var i = 0; i < comments.length; i++)
	        		{
						comments[i].attVer = ver;
						confComments.push(comments[i]);
						collectChildren(comments[i]);
	        		}
		        	
		        	checkDone(true);
		        },
		        error : error
		    }); 
		};
		
		function doNextChunk()
		{
			remaining--;
			
			if (remaining < 0)
			{
				success(checkUnresolvedOnly? false : confComments, AC.getSiteUrl());
				return;
			}
			
			doGetComments(AC.curCommentIndex[remaining], doNextChunk, error);
		}
	}
	else
	{
		error({message: mxResources.get('saveDiagramFirst', null, 'Save diagram first!')});
	}
}, true);

AC.hasUnresolvedComments = function(pageId, contentId, diagramName, callback, error) 
{
	AC.getOldComments(contentId, function(comments)
	{
		var hasOldComments = false;
		
		for (var i = 0; i < comments.length; i++)
		{
			if (comments[i].isDeleted) continue;
			
			hasOldComments = true;
			
			if (!comments[i].isResolved)
			{
				callback(true);
				break;
			}
		}
		
		if (!hasOldComments)
		{
			//Get current diagram information which is needed for comments
			//This call is needed since we allow calling this from viewer without using AC.loadDiagram
			//TODO viewer needs to use AC for interaction with Confluence
			AC.getAttachmentInfo(pageId, diagramName, false, function(info)
			{
				AC.curDiagVer = info.version.number;
				AC.curDiagId = info.id;
				
				AC.getComments(null, true, callback, error);
			}, 
			error);
		}
	}, 
	error);
};

AC.setCommentsAttVersIndex = function(attId, vers) 
{
	AC.setContentProperty(attId, 'attachment', AC.curCommentIndexId, AC.COMMENTS_INDEX_PROP, JSON.stringify(vers), AC.curCommentIndexVer, 
	function(resp)
	{
		resp = JSON.parse(resp);
		AC.curCommentIndexVer = resp.version.number;
	}, 
	AC.noop); //Ignore errors	
};

AC.getCommentsAttVersIndex = function(attId, success, error)
{
	AC.getContentProperty(attId, 'attachment', AC.COMMENTS_INDEX_PROP, function(resp)
	{
		resp = JSON.parse(resp);
		AC.curCommentIndexId = resp.id;
		AC.curCommentIndexVer = resp.version.number;
		
		try
		{
			AC.curCommentIndex = JSON.parse(resp.value);
			
			if (AC.curCommentIndex.length > AC.curDiagVer)
			{
				AC.curCommentIndex = []; //The length of the index cannot exceed the number of the versions, so, index is corrupt
			}
		}
		catch(e)
		{
			AC.curCommentIndex = [];
		}
		
		success(AC.curCommentIndex);
	}, function()
	{
		AC.curCommentIndex = [];
		error();
	});	
};

AC.getAttVersWithComments = function(attId, attVer, callback, error)
{
	var start = 1;
	var vers = [], versMap = {};
	
	function checkChunk(start, end, callback, error)
	{
		var doneCount = 0, total = end - start + 1;
		
		function checkDone()
		{
			doneCount++;
			
			if (doneCount == total)
			{
				callback();	
			}
		}
		
		function checkVer(ver)
		{
			AP.request({
		        url : '/api/v2/attachments/' + attId + 
						'/footer-comments?limit=250&version=' + ver,
		        type : 'GET',
		        success : function(comments) 
		        {
		        	//TODO handle paging or 200 comments + 25 replies are enough?
		        	if (JSON.parse(comments).results.length > 0)
		        	{
		        		vers.push(ver);
		        		versMap[ver] = true;
		        	}
		        	
	        		checkDone();
		        },
		        error : error
			});
		};
		
		for (var i = start; i <= end; i++)
		{
			checkVer(i);
		}
	};
	
	function doNextChunk()
	{
		if (start > attVer)
		{
			callback(vers, versMap);
			return;
		}
		
		//Check all versions 5 at a time
		checkChunk(start, Math.min(start + 4, attVer), doNextChunk, error);
		start += 5;
	}
	
	doNextChunk();
};

AC.addComment = AC.commentsFnWrapper(function(commentContent, success, error)
{
	var attId = AC.curDiagId;
	
	if (attId)
	{
		AP.request({
	        url : '/api/v2/footer-comments',
	        type : 'POST',
	        data: JSON.stringify({
            	attachmentId: attId,
                body: {
					representation: 'storage',
					value: encodeURIComponent(commentContent)
				}
	        }),
	        success : function(addedComment) 
	        {
	        	addedComment = JSON.parse(addedComment);
	        	success(addedComment.id, addedComment.version.number, AC.curDiagVer);
	        	
	        	//Add cur ver to list of versions
	        	if (AC.curCommentIndex.indexOf(AC.curDiagVer) == -1)
        		{
	        		AC.curCommentIndex.push(AC.curDiagVer);
	        		AC.setCommentsAttVersIndex(attId, AC.curCommentIndex);
        		}
	        },
	        error : error,
	        contentType: 'application/json;charset=UTF-8'
	    });
	}
	else
	{
		error({message: mxResources.get('saveDiagramFirst', null, 'Save diagram first!')});
	}
}, true);

AC.addCommentReply = AC.commentsFnWrapper(function(parentId, parentAttVer, replyContent, doResolve, callback, error)
{
	//We cannot add replies to comments that belong to old versions of the attachment, so, as a workaround we add a special regular comment
	if (parentAttVer != AC.curDiagVer)
	{
		AC.addComment(AC.REPLY_MARKER + parentId + AC.REPLY_MARKER_END + (doResolve? AC.RESOLVED_MARKER : '') + replyContent, callback, error);
	}
	else
	{
		AP.request({
	        url : '/api/v2/footer-comments',
	        type : 'POST',
	        data: JSON.stringify({
	        	parentCommentId: parentId,
	            body: {
					value: encodeURIComponent((doResolve? AC.RESOLVED_MARKER : '') + replyContent),
					representation: 'storage'
			    }
	        }),
	        success : function(addedReply) 
	        {
	        	addedReply = JSON.parse(addedReply);
	        	callback(addedReply.id, addedReply.version.number);
	        },
	        error : function(xhr) 
	        {
	        	if (xhr.responseText && xhr.responseText.indexOf('messageKey=parent.comment.does.not.exist') > 0)
	    		{
	        		error({message: mxResources.get('parentCommentDel', null, 'Parent comment has been deleted. A reply cannot be added.')});
	    		}
	        	else 
	        	{
	        		error(xhr)
	        	}
	        },
	        contentType: 'application/json;charset=UTF-8'
		});
	}
});

AC.editComment = AC.commentsFnWrapper(function(id, version, newContent, success, error)
{
	AP.request({
        url : '/api/v2/footer-comments/' + id,
        type : 'PUT',
        data: JSON.stringify({
        	body: {
		        value: encodeURIComponent(newContent),
		        representation: 'storage'
		    },
            version: {
                number: version + 1
            }
        }),
        success : function(editedComment) 
        {
        	editedComment = JSON.parse(editedComment);
        	success(editedComment.version.number);
        },
        error : error,
        contentType: 'application/json;charset=UTF-8'
    });
});

AC.deleteComment = function(id, version, hasReplies, success, error)
{
	function doDel()
	{
		AP.request({
	        url : '/api/v2/footer-comments/' + id,
	        type : 'DELETE',
	        success : success,
	        error : error
	    });
	};
	
	if (hasReplies)
	{
		//Mark as deleted if there is replies
		AC.editComment(id, version, AC.DELETED_MARKER, function()
		{
			success(true);
		}, error);
	}
	else
	{
		doDel();
	}
};

AC.getOldComments = function(contentId, callback, error)
{
	if (contentId)
	{
		AP.request({
			type: 'GET',
			url: '/api/v2/custom-content/' + contentId + '?body-format=storage',
			contentType: 'application/json;charset=UTF-8',
			success: function(resp)
			{
				try 
				{
					resp = JSON.parse(resp);
					var infoObj = JSON.parse(decodeURIComponent(resp.body.storage.value));
					var spaceId = resp.spaceId;
					var pageId = resp.pageId || resp.blogpostId;
                    var pageType = resp.pageId? 'page' : 'blogpost';
                    var contentVer = resp.version.number;
                    
					callback(infoObj.comments || [], spaceId, pageId, pageType, contentVer);
				}
				catch(e)
				{
					error(e);
				}
			},
			error: error
		});
	}
	else
	{
		callback([]);
	}
};

//Check if user can edit content (page or another content)
//Confluence doesn't provide an easy way to check for permissions. 
//		E.g., https://draw-test.atlassian.net/wiki/rest/api/content/{contentId}/restriction/byOperation/update/user?accountId={userAccountId}
//		It returns 404 even if the user has permission. It only returns 200 (OK) if the user is explicitly in restrictions list (doesn't check groups also)
AC.userCanEdit = function(contentId, callback, error)
{
	var userFound = false;
	var accountId, groupsCount, parsedGroups = 0;
	
	function checkGroupMembers(resp)
	{
		//If the user belong to multiple groups, callback will be called more than once
		if (userFound) return;
		
		resp = JSON.parse(resp);
		
		var list = resp.results;
		
		for (var i = 0; i < list.length; i++)
		{
			if (list[i].accountId == accountId)
			{
				callback(true);
				userFound = true;
				return;
			}
		}
		
		parsedGroups++;
		
		//All groups parsed
		if (groupsCount == parsedGroups)
		{
			callback(false);
		}
	};
	
	AP.user.getCurrentUser(function(user) {
		accountId = user.atlassianAccountId;
		
		AP.request({
			type: 'GET',
			url: '/rest/api/content/' + contentId + '/restriction/byOperation/update', //This API doesn't work well with paging, BUT 100 as a default limit looks enough
			contentType: 'application/json;charset=UTF-8',
			success: function(resp)
			{
				resp = JSON.parse(resp);
				
				if (resp.restrictions.user.size == 0) //When restrictions are empty, it means all are allowed
				{
					callback(true);
				}
				else
				{
					//Search users
					var list = resp.restrictions.user.results;
					
					for (var i = 0; i < list.length; i++)
					{
						if (list[i].accountId == accountId)
						{
							callback(true);
							userFound = true;
							break;
						}
					}
					
					//Check groups
					if (!userFound)
					{
						if (resp.restrictions.group.size == 0) //The owner must be in the list of editors, so, a group cannot exist without a user in the list
						{
							callback(false); //User cannot edit
						}
						else //For each group check its members!
						{
							var groups = resp.restrictions.group.results;
							groupsCount = groups.length;
							
							for (var i = 0; i < groups.length; i++)
							{
								AP.request({
									type: 'GET',
									url: '/rest/api/group/' + encodeURIComponent(groups[i].id) + '/membersByGroupId',
									contentType: 'application/json;charset=UTF-8',
									success: checkGroupMembers,
									error: error
								});
							}
						}
					}
				}
			},
			error: error
		});		
	});
};

AC.getPageInfo = function(urlOnly, success, error)
{
	AP.getLocation(function(url)
	{
		if (urlOnly) 
		{
			success({url: url});	
		}
		else
		{
			AP.navigator.getLocation(function (location) 
			{
				var contentId = location.context.contentId;
				var isBlogpost = location.context.contentType != 'page';

				AP.request({
					type: 'GET',
					url: '/api/v2/' + (isBlogpost? 'blogposts' : 'pages') + '/' + contentId,
					contentType: 'application/json;charset=UTF-8',
					success: function(resp)
					{
						resp = JSON.parse(resp);
						resp.url = url;
						success(resp);
					},
					error: error
				});
			});
			
		}
	});
};

AC.getTypeUrlPath = function(contentType, fallback)
{
	var typeUrlPath;

	switch (contentType)
	{
		case 'attachment':
			typeUrlPath = 'attachments';
		break;
		case 'custom-content':
			typeUrlPath = 'custom-content';
		break;
		case 'page':
			typeUrlPath = 'pages';
		break;
		case 'blogpost':
			typeUrlPath = 'blogposts';
		break;
		default:
			fallback();
			return null;
	};

	return typeUrlPath + '/';
};

AC.getContentProperty = function(contentId, contentType, propName, success, error, stopRecursion)
{
	var typeUrlPath = AC.getTypeUrlPath(contentType, function()
	{
		if (stopRecursion)
		{
			error();
		}
		else
		{
			AC.getContentType(contentId, function(isBlogpost, type)
			{
				AC.getContentProperty(contentId, type, propName, success, error, true);
			}, error);
		}
	});

	if (typeUrlPath == null) return;

	//List all properties to prevent 404 errors
	AP.request({
		type: 'GET',
		url: '/api/v2/' + typeUrlPath + contentId + '/properties?limit=250', //Most probably paging is not needed as 250 is more than enough
		contentType: 'application/json;charset=UTF-8',
		success: function(resp)
		{
			resp = JSON.parse(resp);
			
			var prop = resp.results.filter(function(p)
			{
				return p.key == propName;
			});
			
			if (prop.length > 0)
			{
				success(JSON.stringify(AC.getLatestItem(prop))); //Stringify since old version of this function expected a string 
			}
			else
			{
				//Mimic the 404 error
				error({status: 404, responseText: '{"statusCode":404,"message":"com.atlassian.confluence.api.service.exceptions.NotFoundException"}'});
			}
		},
		error: error
	});
};

AC.setContentProperty = function(contentId, contentType, propId, propName, propVal, propVersion, success, error, stopRecursion)
{
	var typeUrlPath = AC.getTypeUrlPath(contentType, function()
	{
		if (stopRecursion)
		{
			error();
		}
		else
		{
			AC.getContentType(contentId, function(isBlogpost, type)
			{
				AC.setContentProperty(contentId, type, propId, propName, propVal, propVersion, success, error, true);
			}, error);
		}
	});

	if (typeUrlPath == null) return;

	var obj = {
		value: propVal,
		key: propName
	};
	
	if (propVersion) 
	{
		obj.version = {
			number: propVersion + 1,
			minorEdit: true
		};
	}
	
	AP.request({
		url: '/api/v2/' + typeUrlPath + contentId + '/properties' + (propVersion? '/' + propId : ''),
		type: propVersion? 'PUT' : 'POST',
		contentType: 'application/json;charset=UTF-8',
		data: JSON.stringify(obj),
		success: success,
		error: function(err)
		{
			//This is to fix a bug in confluence when a page is moved, the content property cannot be edited, so delete and ccreate a new one
			if (err.status == 500 && err.responseText.indexOf('Can\'t add an owner from another space') > 0)
			{
				AP.request({
					url: '/api/v2/' + typeUrlPath + contentId + '/properties/' + propId,
					type: 'DELETE',
					success: function()
					{
						AC.setContentProperty(contentId, contentType, null, propName, propVal, null, success, error);
					},
					error: error
				});
			}
			else if (error)
			{
				error(err);	
			}	
		}
	});
};

AC.getConfPageEditorVer = AC.contentTypeFnWrapper(function(pageId, callback)
{
	AC.getContentProperty(pageId, AC.contentTypeCache[pageId].type, 'editor', function(resp)
	{
		resp = JSON.parse(resp);
		callback(resp.value == 'v2'? 2 : 1);
	}, function()
	{
		callback(1);// On error, assume the old editor
	})
});

AC.gotoAnchor = function(anchor)
{
	AC.getPageInfo(false, function(info)
	{
		var url = info.url;
		
		if (url != null)
		{
			//remove any hash
			var hash = url.indexOf('#');
			
			if (hash > -1)
			{
				url = url.substring(0, hash);
			}
			
			AC.getConfPageEditorVer(info.id, function(ver)
			{
				if (ver == 1)
				{
					//When page title has a [ at the beginning, conf adds id- to anchor name
					url = url + '#' + (info.title.indexOf('[') == 0? 'id-' : '') + 
											encodeURI(info.title.replace(/\s/g, '') + '-' + anchor.replace(/\s/g, ''));
				}
				else
				{
					url = url + '#' + encodeURIComponent(anchor.replace(/\s/g, '-'));
				}
				
				top.window.location = url;
			});
			
		}
	}, function()
	{
		//ignore as we cannot get the page info
	});
};

AC.getDiagramRevisions = AC.contentTypeFnWrapper(function(diagramName, pageId, success, error)
{
	AP.request({
		type: 'GET',
		url: '/api/v2/' + (AC.contentTypeCache[pageId].isBP? 'blogposts' : 'pages') + '/' + pageId + '/attachments?filename=' + encodeURIComponent(diagramName),
		contentType: 'application/json;charset=UTF-8',
		success: function(resp)
		{
			resp = JSON.parse(resp);
			var attObj = null;
			
			for (var i = 0; i < resp.results.length; i++)
			{
				if (resp.results[i].title == diagramName)
				{
					attObj = resp.results[i];
				}
			}

			if (attObj != null)
			{
				AP.request({
					type: 'GET',
					url: '/api/v2/attachments/' + attObj.id + '/versions?sort=-modified-date',
					contentType: 'application/json;charset=UTF-8',
					success: function(resp)
					{
						resp = JSON.parse(resp);
						var revs = [];
						
						for (var i = 0; i < resp.results.length; i++)
						{
							var rev =  resp.results[i];

							revs.unshift({
								modifiedDate: rev.createdAt,
								lastModifyingUserName: '', // TODO Use authorId but needs another request! 
								downloadUrl: '/download/attachments/' + pageId + '/' + encodeURIComponent(diagramName) + '?version=' + rev.number,
								obj: rev
							});
						}
						
						success(revs);
					},
					error: error
				});
			}
			else
			{
				error();
			}
		},
		error: error
	});
}, 1);

AC.setHiResPreview = function(hiResPreview, success, error)
{
	AC.hiResPreview = hiResPreview;
};

AC.setAspect = function(aspect, success, error)
{
	AC.aspect = aspect;
};

AC.getAspectObj = function()
{
	if (AC.aspect != null && AC.aspect !== 'undefined' && AC.aspect.length > 0)
	{
		var aspectArray = AC.aspect.split(' ');
		
		if (aspectArray.length > 0)
		{
			return {pageId: aspectArray[0], layerIds: aspectArray.slice(1)};
		}
	}
	
	return {};
};

AC.getAttachmentInfo = AC.contentTypeFnWrapper(function(pageId, attName, withMoreInfo, sucess, error)
{
	AP.request({
        type: 'GET',
        url: '/api/v2/' + (AC.contentTypeCache[pageId].isBP? 'blogposts' : 'pages') + '/' + pageId + '/attachments?filename=' + 
        		encodeURIComponent(attName),
        contentType: 'application/json;charset=UTF-8',
        success: function (resp) 
        {
        	var tmp = JSON.parse(resp);
            
        	if (tmp.results && tmp.results.length > 0)
        	{
				var info = AC.getLatestItem(tmp.results);

				if (withMoreInfo)
				{
					AP.request({
						type: 'GET',
						url: '/rest/api/content/search?cql=' + encodeURIComponent('ID=' + info.id) + 
							'&expand=version,history',
						contentType: 'application/json;charset=UTF-8',
						success: function (resp) 
						{
							resp = JSON.parse(resp);
							var attInfo = {};

							try
							{
								resp = resp.results[0];
								
								attInfo = {
									title: info.title,
									creatorName: resp.history.createdBy.displayName,
									lastModifiedBy: resp.version.by.displayName,
									lastModifiedTime: resp.version.when
								};
							}
							catch(e){};

							sucess(info, attInfo);
						},
						error: error
					});
				}
				else
				{
					sucess(info);
				}
        	}
        	else
    		{
        		error({status: 404});
    		}
        },
        error: error
    });	
});


AC.getAttInfoById = function(attId, success, error)
{
	AP.request({
		type: 'GET',
		url: '/api/v2/attachments/' + attId,
		contentType: 'application/json;charset=UTF-8',
		success: function (resp) 
		{
			resp = JSON.parse(resp);
			success(resp);
		},
		error: error
	});
};

AC.setFileDescriptor = function(desc, success, error)
{
	if (!AC.curDiagId)
	{
		if (error != null)
		{
			error({});
		}
		
		return;
	}
	
	desc.id = AC.curDiagId;
	
	AC.setContentProperty(AC.curDiagId, 'attachment', desc.propId, AC.COLLAB_PROP, 
		  encodeURIComponent(JSON.stringify(desc)), desc.headRevisionId, function(resp)
		  {
			if (success != null)
			{
			  resp = JSON.parse(resp);
			  desc.propId = resp.id;
			  desc.headRevisionId = resp.version.number;
			  desc.modifiedDate = resp.version.when;
			  desc.etag = desc.etagP + '-' + desc.headRevisionId;
			  success(desc);
			}
		  }, error);
};

AC.getFileDescriptor = function(success, error)
{
	var desc = {
		id: AC.curDiagId? AC.curDiagId: null,
		hasDraft: AC.state.hasDraft
	};
	
	function done()
	{
		success(desc);
	};
	
	if (AC.curDiagId)
	{
		AC.getContentProperty(AC.curDiagId, 'attachment', AC.COLLAB_PROP, function(resp)
		{
		  try
		  {
			  resp = JSON.parse(resp);
			  desc = JSON.parse(decodeURIComponent(resp.value));
			  desc.propId = resp.id;
			  desc.headRevisionId = resp.version.number;
			  desc.modifiedDate = resp.version.when;
			  desc.etag = desc.etagP + '-' + desc.headRevisionId;
			  desc.id = AC.curDiagId;
		  } catch(e){} //Ignore
		  
		  done();
		}, done);
	}
	else
	{
		done();
	}
};

AC.saveDraftWithFileDesc = function(data, desc, success, error)
{
	if (!AC.curDiagId)
	{
		error({});
		return;
	}
	
	var retryCount = 0;
	var lockVersion = null, lockId = null;
	
	function onError(err)
	{
		unlock();
		
		if ((err == null || err.status != 409) && retryCount < AC.maxRetries)
		{
			retryCount++;
			var jitter = 1 + 0.1 * (Math.random() - 0.5);
			window.setTimeout(startSave,
						Math.round(2 * retryCount * jitter * AC.coolOff));
		}
		else
		{
			error(err);
		}
	};
	
	function unlock(callback)
	{
		if (lockVersion != null)
		{
			AC.setContentProperty(AC.curDiagId, 'attachment', lockId, AC.COLLAB_LOCK_PROP, 0, lockVersion, callback, callback);
			AC.log('saveDraftWithFileDesc.unlock',
				'lockVersion', lockVersion);
		}
	};
	
	function getLockSuccess(lockVal)
	{
		//Property is locked (with timeout such that lock is released after a certain time [30 sec])
		//If version is changed then these is a conflic, the same if the property is locked
		if (lockVal && AC.myDescLock != lockVal && Date.now() - lockVal < 30000)
		{
			AC.log('CONFLICT: ' + JSON.stringify(desc));
			onError({status: 409, isLocked: true}); //Conflict
		}
		else //Now acquire lock and start saving
		{
			AC.myDescLock = Date.now();
			
			AC.setContentProperty(AC.curDiagId, 'attachment', lockId, AC.COLLAB_LOCK_PROP, AC.myDescLock, lockVersion, function(resp)
			{
				resp = JSON.parse(resp);
				lockVersion = resp.version.number;
				lockId = resp.id;
				AC.log('getLockSuccess.setContentProperty',
					'curDiagId', AC.curDiagId,
					'lockVersion', lockVersion,
					'resp', [resp]);
				
				//TODO Review this, saving draft before descriptor is incorrect (if desc failed, the draft overwrite others changes). 
				//					Opposite can lead to inconsistent desc or state (old draft with the new desc)?
				AC.setFileDescriptor(desc, function(resp)
				{
					function doSave()
					{
						AC.saveDraft(data, function()
						{
							//Unlock and finish
							unlock();
							success(resp);
						},
						function(err) //Retry within 20 sec of our lock timeout 
						{
							//No write permission or payload is too large!
							if (err.status == 403 || err.status == 413)
							{
								unlock(function()
								{
									AC.showNotification({
									  title: mxResources.get('draftWriteErr'),
									  body: err.status == 413? mxResources.get('confFileTooBigErr') : 
													mxResources.get('confDraftPermissionErr'),
									  type: 'error',
									  close: 'manual'
									});
					    		
					    			AP.dialog.close();
								});
							}
							else if (Date.now() - AC.myDescLock < 20000)
							{
								doSave();
							}
							else //No time to retry, unlock and send error
							{
								onError({status: 409}); //Conflict
							}
						});
					};
			
					doSave();
				}, onError);
			}, onError);
		}
	};
	
	function startSave()
	{
		AC.getContentProperty(AC.curDiagId, 'attachment', AC.COLLAB_LOCK_PROP, function(resp)
	    {
			resp = JSON.parse(resp);
			AC.log('startSave.getContentProperty',
				'curDiagId', AC.curDiagId,
				'resp', [resp]);
			lockId = resp.id;
			lockVersion = resp.version.number;
			getLockSuccess(parseInt(resp.value));
		}, function(err)
		{
			//Property not found, unlocked
			if (err.status == 404)
			{
				getLockSuccess();
			}
			else
			{
				onError(err);
			}	
		});
	};
	
	startSave();
};

AC.getDraftFileContent = function(success, error)
{
	AC.getFileDescriptor(function(desc)
	{
		AP.request({
	        type: 'GET',
			url: '/download/attachments/' + AC.state.pageId + '/' + encodeURIComponent(AC.state.draftName),
	        contentType: 'text/xml;charset=UTF-8',
	        success: function(data)
	        {
	        	success(data, desc);
	        },
			error: error
		});
	}, error);
};

AC.getCurPageAnchors = function(success, error)
{
	AP.request({
		type: 'GET',
		url: '/api/v2/' + (AC.contentTypeCache[AC.state.pageId].isBP? 'blogposts' : 'pages') + '/' + AC.state.pageId + '?body-format=storage' + (AC.customContentEditMode || AC.directEditMode? '' : '&get-draft=true'), //Use published content with direct edit
		contentType: 'application/json;charset=UTF-8',
		success: function(page) 
		{
			page = JSON.parse(page);
			parser = new DOMParser();
			xmlDoc = parser.parseFromString(page.body.storage.value, 'text/html');
			AC.getConfPageEditorVer(page.id, function(ver)
			{
				var anchors = [];

				//Anchor macros are now supported by the new editor
				var anchorElems = xmlDoc.querySelectorAll('ac\\:structured-macro[ac\\:name="anchor"] > ac\\:parameter');

				for (var i = 0; i < anchorElems.length; i++)
				{
					anchors.push(AC.htmlEntities(anchorElems[i].innerText));
				}
					
				if (ver != 1)
				{
					var headingElems = xmlDoc.querySelectorAll('h1, h2, h3, h4, h5, h6');

					for (var i = 0; i < headingElems.length; i++)
					{
						var headingNodes = headingElems[i].childNodes, anchorTxt = '';

						try
						{
							for (var j = 0; j < headingNodes.length; j++)
							{
								if (headingNodes[j].nodeType == 3)
								{
									anchorTxt += headingNodes[j].nodeValue;
								}
								else
								{
									anchorTxt += '[inlineExtension]';
								}
							}
						}
						catch (e)
						{
							anchorTxt = headingElems[i].innerText;
						}

						anchors.push(AC.htmlEntities(anchorTxt));
					}
				}
			
				success(anchors);
			}, error);
		},
		error: error
	});
};

AC.getAvailableSpaces = function(success, error)
{
	AC.getAllItemsCursor('/rest/api/search?cql=type%3Dspace&limit=250', function(spaces)
	{
		success(spaces.sort(function(a, b)
		{
			return a.title.localeCompare(b.title);
		}));
	}, error);
};

AC.contentSearch = function(searchStr, spaces, success, error)
{
	AP.request({
		//cannot use * as a first character https://jira.atlassian.com/browse/JRASERVER-6218 (also * doesn't work with some Asian language')
		url: '/rest/api/content/search?expand=metadata,space,version&limit=250&cql=' + encodeURIComponent('(title ~ "' + searchStr + '*" or title ~ "' + searchStr + '")' +
							(spaces && spaces.length > 0? ' and space in ("' + spaces.join('","') + '")' : '')),
		type: 'GET',
		contentType: 'application/json;charset=UTF-8',
		success: function(resp) 
		{
			success(JSON.parse(resp).results);				
		},
		error : error
	});
};

AC.getContentInfo = function(id, contentType, success, error, stopRecursion)
{
	var typeUrlPath = AC.getTypeUrlPath(contentType, function()
	{
		if (stopRecursion)
		{
			error();
		}
		else
		{
			AC.getContentType(id, function(isBlogpost, type)
			{
				AC.getContentInfo(id, type, success, error, true);
			}, error);
		}
	});

	if (typeUrlPath == null) return;

	AP.request({
		url: '/api/v2/' + typeUrlPath + id,
		type: 'GET',
		contentType: 'application/json;charset=UTF-8',
		success: function(resp) 
		{
			success(JSON.parse(resp));				
		},
		error : error
	});
};

AC.getConfig = function(callback, onError, stopIfCached, cacheUpdatedCB)
{
	var baseUrl = AC.getBaseUrl();
	var cacheKey = '.drawio-conf-config-' + baseUrl;
	var inProgressKey = cacheKey + '-in-progress';
	var cachedConfig = null;

	if (AC.hasLocalStorage)
	{
		cachedConfig = localStorage.getItem(cacheKey);
		
		try
		{
			cachedConfig = cachedConfig ? JSON.parse(cachedConfig) : null;
		}
    	catch (e)
    	{
			cachedConfig = null;
       		localStorage.removeItem(cacheKey);
    	}
	}
	
	if (cachedConfig != null)
	{
		callback(cachedConfig, true); // Return cached config immediately then load and check changes async

		if (stopIfCached || (Date.now() - cachedConfig.$$lastFetched) < 60000) // 60 sec to prevent multiple requests
		{
			return;
		}
	}

	if (AC.hasLocalStorage)
	{
		var inProgress = localStorage.getItem(inProgressKey);

		if (inProgress != null && (Date.now() - inProgress) < 30000) // 30 sec timeout in case it's not removed
		{
			var retryId = setInterval(function()
			{
				console.log('Waiting for config to load...');
				inProgress = localStorage.getItem(inProgressKey);

				if (inProgress == null || (Date.now() - inProgress) > 30000) // 30 sec timeout in case it's not removed
				{
					clearInterval(retryId);
					AC.getConfig(cachedConfig != null? AC.noop: callback, onError, stopIfCached, cacheUpdatedCB);
				}
			}, 50);
			return;
		}
		else
		{
			localStorage.setItem(inProgressKey, Date.now());
		}
	}

	AC.getCurrentUserTeams(function(teams, user, teamsMap)
	{
		AP.request({
			type: 'GET',
			url: '/rest/api/content/search?cql=type%3Dpage%20and%20space%3DDRAWIOCONFIG%20and%20title~Configuration*', //type=page and space=DRAWIOCONFIG and title~Configuration*. Search doesn't return 404 if not found
			contentType: 'application/json;charset=UTF-8',
			success: function (resp) 
			{
				var confPages = [];
				resp = JSON.parse(resp);

				for (var i = 0; i < resp.size; i++)
				{
					var page = resp.results[i];
					var title = page.title;

					if (title.substring(0, 13) == 'Configuration')
					{
						var teamName = title.substring(14);

						if (teamName == '' || teamsMap[teamName] != null)
						{
							confPages.push(page);
						}
					}		
				}
				
				if (confPages.length > 0)
				{
					confPages.sort(function (a, b) 
					{
						return a.title.localeCompare(b.title);
					});

					var doneCount = 0, configContents = [], versions = {};

					function checkDone()
					{
						doneCount++;

						if (doneCount == confPages.length)
						{
							var compositedConfig = {};

							for (var i = 0; i < configContents.length; i++)
							{
								Object.assign(compositedConfig, configContents[i]);
							}

							compositedConfig.$$versions = versions;
							compositedConfig.$$lastFetched = Date.now();

							if (AC.hasLocalStorage)
							{
								localStorage.setItem(cacheKey, JSON.stringify(compositedConfig));
								localStorage.removeItem(inProgressKey);
							}

							if (cachedConfig == null)
							{
								callback(compositedConfig, false);
							}
							else if (cacheUpdatedCB != null)
							{
								var configModified = cachedConfig.$$versions == null;

								if (!configModified)
								{
									for (var key in versions)
									{
										if (versions[key] != cachedConfig.$$versions[key])
										{
											configModified = true;
											break;
										}
									}
								}

								if (configModified)
								{
									cacheUpdatedCB(compositedConfig);
								}
							}
						}
					};

					//load the configuration files
					for (var i = 0; i < confPages.length; i++)
					{
						(function(confPage, index)
						{
							AP.request({
								type: 'GET',
								url: '/download/attachments/' + confPage.id + '/' + AC.CONFIG_FILENAME,
								contentType: 'application/json;charset=UTF-8',
								success: function(content)
								{
									try
									{
										configContents[index] = JSON.parse(content);
										versions[confPage.title] = configContents[index].version || 1;
										versions.count = Math.max(versions.count || 0, index + 1);
									}
									catch (e)
									{
										// ignore
										console.log(confPage.title, 'Configuration error', e);
									}

									checkDone();
								},
								error: checkDone // if there is an error loading the configuration, just load the editor normally. E.g., 404 when the space doesn't exist
							});
						})(confPages[i], i);
					}
				}
				else 
				{
					if (AC.hasLocalStorage)
					{
						localStorage.setItem(cacheKey, '{}');
						localStorage.removeItem(inProgressKey);
					}

					callback({}, false);
				}
			},
			error: function (e)
			{
				if (AC.hasLocalStorage)
				{
					localStorage.removeItem(inProgressKey);
				}
				
				onError(e);
			}
		});	
	}, onError);
};

AC.buildGitHubUrl = function(githubOwner, githubRepository, githubBranch, githubFilename)
{
	return 'https://raw.githubusercontent.com/' +
				encodeURIComponent(githubOwner) + '/' +
				encodeURIComponent(githubRepository) + '/' +
				encodeURIComponent(githubBranch) + '/' +
				encodeURIComponent(githubFilename);	
};

AC.setupConfPlaceholders = function(info)
{
	var graphGetGlobalVariable = Graph.prototype.getGlobalVariable;
	
	Graph.prototype.getGlobalVariable = function(name)
	{
		try
		{
			if (name.toLowerCase() == 'filename')
			{
				return info.diagramDisplayName || info.diagramName || info.title;
			}
			else if (name == 'creatorName')
			{
				return info.creatorName;
			}
			else if (name == 'lastModifiedBy')
			{
				return info.lastModifiedBy;
			}
			else if (name.substring(0, 16) == 'lastModifiedTime')
			{
				var index = name.indexOf(':');
				var format = (index > 0) ? name.substring(index + 1) : '';
				
				return this.formatDate(new Date(info.lastModifiedTime), format);
			}
			else if (name == 'version')
			{
				return info.revision;
			}
		}
		catch(e){}
		
		return graphGetGlobalVariable.apply(this, arguments);
	};
};

AC.countDrawioMacros = function(success, error)
{
	AP.request({
		type: 'GET',
		url : '/rest/api/search?cql=' + encodeURIComponent('type="ac:com.mxgraph.confluence.plugins.diagramly:drawio-diagram"') + 
					'&limit=1&includeArchivedSpaces=true',
		contentType: 'application/json;charset=UTF-8',
		success: function(resp) 
		{
			success(JSON.parse(resp).totalSize);
		},
		error : error
	});
};

AC.getAllItems = function(url, success, error, limit)
{
	var result = [], start = 0;
	limit = limit || 250;
	
	var getItemsChunk = function()
	{
		AC.requestWithRetry({
			type: 'GET',
			url : url + (url.indexOf('?') > 0 ? '&' : '?') + 'start=' + start + '&limit=' + limit,
			contentType: 'application/json;charset=UTF-8',
			success: function(resp) 
			{
				resp = JSON.parse(resp);
				Array.prototype.push.apply(result, resp.results);
				
				if (resp.size == limit)
				{
					start += limit;
					getItemsChunk();
				}
				else
				{
					success(result);
				}
			},
			error : error
		});
	};
	
	getItemsChunk();
};

AC.getAllItemsCursor = function(url, success, error)
{
	var result = [];
	
	var getItemsChunk = function(url)
	{
		AC.requestWithRetry({
			type: 'GET',
			url : url,
			contentType: 'application/json;charset=UTF-8',
			success: function(resp) 
			{
				resp = JSON.parse(resp);
				Array.prototype.push.apply(result, resp.results);
				
				//Support paging
				if (resp._links && resp._links.next) 
				{
					var next = resp._links.next;

					if (next.indexOf('/wiki') == 0)
					{
						next = next.substring(5);
					}

					getItemsChunk(next.replace(/\&\_r\=\d+/g, '')); //Remove repeated _r paramter from the URL
				}
				else
				{
					success(result);
				}
			},
			error : error
		});
	};
	
	getItemsChunk(url);
};

AC.checkConfigSpace = function(success, notFound, error)
{
	AP.request({
        type: 'GET',
        url: '/api/v2/spaces?keys=DRAWIOCONFIG',
        contentType: 'application/json;charset=UTF-8',
        success: function (resp) 
        {
        	resp = JSON.parse(resp);
        	
        	if (resp.results.length > 0)
    		{
				if (resp.results[0].status == 'archived')
				{
					error('archived');
					return;
				}

				AC.getAllItemsCursor('/rest/api/content/search?cql=type%3Dpage%20and%20space%3DDRAWIOCONFIG&expand=ancestors,' + 
					'restrictions.read.restrictions.user,restrictions.read.restrictions.group,' + 
					'restrictions.update.restrictions.user,restrictions.update.restrictions.group', function(list)
					{
						success(list, resp.results[0].id);
					}, error);
    		}
        	else
    		{
        		notFound();
    		}
        },
        error: error
    });
};

AC.getContentRestrictions = function(contentId, success, error)
{
	AP.request({
		type: 'GET',
		url: '/rest/api/content/' + contentId + '/restriction',
		contentType: 'application/json;charset=UTF-8',
		success: function(resp)
		{
			var resp = JSON.parse(resp);
			var readers = [], readerGroups = [], writers = [], writerGroups = [];

			for (var i = 0; i < resp.results.length; i++)
			{
				var r = resp.results[i];
				
				if (r.operation == 'read')
				{
					readers = r.restrictions.user.results;
					readerGroups = r.restrictions.group.results;
				}
				else if (r.operation == 'update')
				{
					writers = r.restrictions.user.results;
					writerGroups = r.restrictions.group.results;
				}
			}

			success(writers, writerGroups, readers, readerGroups);
		},
		error: error
	});
};

AC.setContentRestrictions = function(contentId, writers, writerGroups, readers, readerGroups, success, error)
{
	AP.user.getCurrentUser(function(user) 
	{
		var restrictionsArr = [{
			"operation": "update",
			"restrictions": {}
		}];

		if (writers == null)
		{
			writers = [];
		}

		// Restriction must include current user
		writers.push(user.atlassianAccountId);
		restrictionsArr[0].restrictions.user = [];

		for (var i = 0; i < writers.length; i++)
		{
			restrictionsArr[0].restrictions.user.push({
				type: 'known',	
				accountId: writers[i]
			});
		}

		if (writerGroups != null)
		{
			restrictionsArr[0].restrictions.group = [];

			for (var i = 0; i < writerGroups.length; i++)
			{
				restrictionsArr[0].restrictions.group.push({
					type: 'group',	
					name: writerGroups[i]
				});
			}
		}

		if (readers != null || readerGroups != null)
		{
			restrictionsArr.push({
				"operation": "read",
				"restrictions": {}
			});

			// Restriction must include current user
			if (readers == null)
			{
				readers = [];
			}

			readers.push(user.atlassianAccountId);
		}

		if (readers != null)
		{
			restrictionsArr[1].restrictions.user = [];

			for (var i = 0; i < readers.length; i++)
			{
				restrictionsArr[1].restrictions.user.push({
					type: 'known',	
					accountId: readers[i]
				});
			}
		}

		if (readerGroups != null)
		{
			restrictionsArr[1].restrictions.group = [];

			for (var i = 0; i < readerGroups.length; i++)
			{
				restrictionsArr[1].restrictions.group.push({
					type: 'group',	
					name: readerGroups[i]
				});
			}
		}

		AP.request({
			type: 'PUT',
			url: '/rest/api/content/' + contentId + '/restriction',
			contentType: 'application/json;charset=UTF-8',
			data: JSON.stringify(restrictionsArr),
			success: success,
			error: error
		});
	});
};

AC.getUserGroups = function(userId, success, error)
{
	AP.request({
		type: 'GET',
		url: '/rest/api/user/memberof?accountId=' + userId,
		contentType: 'application/json;charset=UTF-8',
		success: success,
		error: error
	});
};

AC.getCurrentUserTeams = function(success, error)
{
	AP.user.getCurrentUser(function(user) 
	{
		AC.getUserGroups(user.atlassianAccountId, function(groups)
		{
			groups = JSON.parse(groups);
			var teams = [], teamsMap = {};

			for (var i = 0; i < groups.results.length; i++)
			{
				var group = groups.results[i];
				
				if (group.name.indexOf('drawio-') == 0)
				{
					teams.push(group);
					teamsMap[group.name] = group;
				}
			}
			
			success(teams, user, teamsMap);
		}, error);
	});
};

AC.createPage = function(title, desc, spaceId, parentId, success, error)
{
	var pageObj = {
		spaceId: spaceId,
		title: title,
		status: 'current',
		body: {
			value: desc,
			representation: 'storage'
		}
	};

	if (parentId != null)
	{
		pageObj.parentId = parentId;
	}
	
	AP.request({
		type: 'POST',
		url: '/api/v2/pages',
		contentType: 'application/json;charset=UTF-8',
		data: JSON.stringify(pageObj),
		success: success,
		error: error
	});
};

AC.createAttFile = function(pageId, filename, mimeType, content, callback, error, checkExist)
{
	function doCreateFile()
	{
		var attFile = new Blob([content], {type : mimeType});
		attFile.name = filename;
		 
		var reqData = {file: attFile, minorEdit: true};
		 
		AP.request({
			type: 'PUT',
			data: reqData,
			url:  '/rest/api/content/' + pageId + '/child/attachment',
			contentType: 'multipart/form-data',
			success: callback,
			error: error
		});
	};
	
	//check file exists
	if (checkExist)
	{
		AC.getAttachmentInfo(pageId, filename, false, function()
		{
			//file exists
			callback(true);
		}, function(err)
		{
			if (err.status == 404)
			{
				doCreateFile();
			}
			else
			{
				error(err);
			}
		});
	}
	else
	{
		doCreateFile();
	}
};

AC.errorsCatsStats = {};

AC.resetErrorsCatsStats = function()
{
	AC.errorsCatsStats = {};
};

AC.formatErrorStats = function(log)
{
	try
	{
		var totalErrs = AC.errorsCatsStats['total'] || 0;
		var err403 = AC.errorsCatsStats[403] || 0;
		var err404 = AC.errorsCatsStats[404] || 0;
		var err500 = AC.errorsCatsStats[500] || 0;
		var remaining = totalErrs - err403 - err404 - err500;

		// Check errors and show faqs
		if (totalErrs > 0)
		{
			log.append($('<br><br><div style="color: var(--ds-text-accent-blue,blue);font-weight:bold">' + mxResources.get('confAErrFaqs', [totalErrs]) + ':</div>'));
			var err403Msg = mxResources.get('confA403ErrFaq', [err403]) + ' (<a href="https://jira.atlassian.com/browse/CONFCLOUD-1053">https://jira.atlassian.com/browse/CONFCLOUD-1053</a>)';
			
			if (err403 > 0)
			{
				log.append($('<br><div style="color: var(--ds-text-accent-blue,blue)">- ' + err403Msg + '</div>'));
			}

			if (err404 > 0)
			{
				log.append($('<br><div style="color: var(--ds-text-accent-blue,blue)">- ' + mxResources.get('confA404ErrFaq', [err404]) + 
					' + ' + err403Msg.substring(err403Msg.indexOf('.') + 1) + '</div>')); //API v2 returns 404 for permissions errors also
			}

			if (err500 > 0)
			{
				log.append($('<br><div style="color: var(--ds-text-accent-blue,blue)">- ' + mxResources.get('confA500ErrFaq', [err500]) + '</div>'));
			}

			if (remaining > 0)
			{
				log.append($('<br><div style="color: var(--ds-text-accent-blue,blue)">- ' + mxResources.get('confAOtherErrFaq', [remaining]) + '</div>'));
			}

			log.append($('<br><br>'));
		}
	}
	catch (e) {} // ignore
};

AC.formatError = function(err, noEscaping)
{
	var frmtMsg = ' -- Unknown Error';

	if (err != null)
	{
		if (err.message)
		{
			frmtMsg = ' -- Error: ' + err.message;
		}
		else if (err.status != null)
		{
			var msg = err.responseText;

			try
			{
				var errObj = JSON.parse(msg);

				if (errObj.message)
				{
					msg = errObj.message;
				}
			}
			catch (e) {} // Ignore

			try
			{
				if (msg.length > 500)
				{
					msg = msg.substring(0, 500) + '...';
				}
			}
			catch(e){} // ignore

			AC.errorsCatsStats[err.status] = (AC.errorsCatsStats[err.status] || 0) + 1;
			AC.errorsCatsStats['total'] = (AC.errorsCatsStats['total'] || 0) + 1;
			frmtMsg = ' -- Error (' + err.status + '): ' + msg;
		}
	}

	return noEscaping? frmtMsg : AC.htmlEntities(frmtMsg);
};

AC.expBackoff = function(lastRetryDelayMillis)
{
	lastRetryDelayMillis = lastRetryDelayMillis || 5000;
	var maxRetryDelayMillis = 30000;
    var retryDelayMillis = Math.min(2 * lastRetryDelayMillis, maxRetryDelayMillis);
    retryDelayMillis += retryDelayMillis * (Math.random() / 2 + 0.7); // jitterMultiplierRange = [0.7, 1.3]
	return retryDelayMillis;
};

AC.requestWithRetry = function(req, retryCount, lastRetryDelayMillis)
{
	retryCount = retryCount || 0;
	var origReq = Object.assign({}, req);
	var reqError = req.error;

	req.error = function(err)
	{
		var limit = 1;
		
		try
		{
			var origLimit = req.url.match(/limit=(\d+)/);

			if (origLimit != null)
			{
				limit = parseInt(origLimit[1]);
			}
		}
		catch (e) {} // ignore

		// Rate limit
		if (err.status == 429 && retryCount < 2) // Retry only twice (3 attempts in total)
		{
			var retryAfter = 0;

			try
			{
				retryAfter = err.getResponseHeader('Retry-After');
				retryAfter = retryAfter != null? (parseInt(retryAfter) * 1000) : 0;
			}
			catch(e) {} // ignore
			
			lastRetryDelayMillis = Math.max(retryAfter, AC.expBackoff(lastRetryDelayMillis));

			setTimeout(function()
			{
				AC.requestWithRetry(origReq, retryCount + 1, lastRetryDelayMillis);
			}, lastRetryDelayMillis);
		}
		else if (limit > 1 && err.status == 500)
		{
			origReq.url = origReq.url.replace(/limit=\d+/, 'limit=' + Math.ceil(limit / 2));
			AC.requestWithRetry(origReq, retryCount, lastRetryDelayMillis);
		}
		else
		{
			if (reqError)
			{
				reqError.apply(this, arguments);
			}
		}
	}
	
	AP.request(req);
};

// Sometimes this api returns multiple entries for the same property, so pick the latest
AC.getLatestItem = function(items)
{
	var latestItem = items[0];

	for (var i = 1; i < items.length; i++)
	{
		if (items[i].version != null && items[i].version.number > latestItem.version.number)
		{
			latestItem = items[i];
		}
	}

	return latestItem;
};

AC.getContentType = function(contentId, success, error)
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
			var type = resp.results[contentId];
			success(type != 'page', type);
		},
		error: error
	});
};

AC.getSpaceId = function(spaceKey, success, error)
{
	AP.request({
		type: 'GET',
		url : '/api/v2/spaces?keys=' + spaceKey,
		contentType: 'application/json;charset=UTF-8',
		success: function(resp) 
		{
			resp = JSON.parse(resp);
			
			if (resp.results.length > 0)
			{
				success(resp.results[0].id);
			}
			else
			{
				error();
			}
		},
		error : error
	});
};

AC.getPageId = function(spaceId, pageTitle, success, error)
{
	AP.request({
		type: 'GET',
		url : '/api/v2/pages?space-id=' + spaceId + '&title=' + encodeURIComponent(pageTitle),
		contentType: 'application/json;charset=UTF-8',
		success: function(resp) 
		{
			resp = JSON.parse(resp);
			
			if (resp.results.length > 0)
			{
				success(resp.results[0].id, spaceId);
			}
			else // Try blogposts
			{
				AP.request({
					type: 'GET',
					url : '/api/v2/blogposts?space-id=' + spaceId + '&title=' + encodeURIComponent(pageTitle),
					contentType: 'application/json;charset=UTF-8',
					success: function(resp) 
					{
						resp = JSON.parse(resp);
						
						if (resp.results.length > 0)
						{
							success(resp.results[0].id, spaceId);
						}
						else
						{
							error();
						}
					},
					error : error
				});
			}
		},
		error : error
	});
}

AC.fetchForeignUrl = function(url, success, error, timeoutHandler, noProxy)
{
	if (AC.attachmentFullUrl.test(url))
	{
		AP.request({
			url: url.substring(url.indexOf('/download/attachments/')),
			success: success,
			error : error
		});
	}
	else
	{
		mxUtils.get(noProxy? url : (PROXY_URL + '?url=' + encodeURIComponent(url)), function(req)
		{
			if (req.getStatus() >= 200 && req.getStatus() <= 299)
			{
				success(req.getText());
			}
			else
			{
				error(req);
			}
		}, false, timeoutHandler? 25000 : null, timeoutHandler);	
	}	
};

// Src: https://gist.github.com/jonleighton/958841
AC.base64ArrayBuffer = function (arrayBuffer) 
{
	var base64    = ''
	var encodings = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

	var bytes         = new Uint8Array(arrayBuffer)
	var byteLength    = bytes.byteLength
	var byteRemainder = byteLength % 3
	var mainLength    = byteLength - byteRemainder

	var a, b, c, d
	var chunk

	// Main loop deals with bytes in chunks of 3
	for (var i = 0; i < mainLength; i = i + 3) {
		// Combine the three bytes into a single integer
		chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]

		// Use bitmasks to extract 6-bit segments from the triplet
		a = (chunk & 16515072) >> 18 // 16515072 = (2^6 - 1) << 18
		b = (chunk & 258048)   >> 12 // 258048   = (2^6 - 1) << 12
		c = (chunk & 4032)     >>  6 // 4032     = (2^6 - 1) << 6
		d = chunk & 63               // 63       = 2^6 - 1

		// Convert the raw binary segments to the appropriate ASCII encoding
		base64 += encodings[a] + encodings[b] + encodings[c] + encodings[d]
	}

	// Deal with the remaining bytes and padding
	if (byteRemainder == 1) {
		chunk = bytes[mainLength]

		a = (chunk & 252) >> 2 // 252 = (2^6 - 1) << 2
	
		// Set the 4 least significant bits to zero
		b = (chunk & 3)   << 4 // 3   = 2^2 - 1
	
		base64 += encodings[a] + encodings[b] + '=='
	} else if (byteRemainder == 2) {
		chunk = (bytes[mainLength] << 8) | bytes[mainLength + 1]
	
		a = (chunk & 64512) >> 10 // 64512 = (2^6 - 1) << 10
		b = (chunk & 1008)  >>  4 // 1008  = (2^6 - 1) << 4
	
		// Set the 2 least significant bits to zero
		c = (chunk & 15)    <<  2 // 15    = 2^4 - 1
	
		base64 += encodings[a] + encodings[b] + encodings[c] + '='
	}
	
	return base64
};

AC.fetchConfluenceImage = function(src, baseUrl, success, error)
{
	AP.request({
		url: src.substring(baseUrl.length),
		success: function(resp)
		{
			success('data:image/png;base64,' + AC.base64ArrayBuffer(resp));
		},
		error : error,
		binaryAttachment: true
	});
}

//White-listed functions and some info about it
AC.remoteInvokableFns = {
	getRecentDiagrams: {isAsync: true},
	searchDiagrams: {isAsync: true},
	getCustomLibraries: {isAsync: true},
	getFileContent: {isAsync: true},
	getFileContentAsIs: {isAsync: true},
	getCurrentUser: {isAsync: true},
	getOldComments: {isAsync: true},
	getComments: {isAsync: true},
	addComment: {isAsync: true},
	addCommentReply: {isAsync: true},
	editComment: {isAsync: true},
	deleteComment: {isAsync: true},
	userCanEdit: {isAsync: true},
	getCustomTemplates: {isAsync: true},
	getPageInfo: {isAsync: true},
	getDiagramRevisions: {isAsync: true},
	setHiResPreview: {isAsync: false},
	setAspect: {isAsync: false},
	getFileDescriptor: {isAsync: true},
	setFileDescriptor: {isAsync: true},
	getDraftFileContent: {isAsync: true},
	saveDraftWithFileDesc: {isAsync: true},
	checkConfLicense: {isAsync: true},
	getCurPageAnchors: {isAsync: true},
	getCurPageAttachments: {isAsync: true},
	getPageDrawioDiagrams: {isAsync: true},
	getAvailableSpaces: {isAsync: true},
	contentSearch: {isAsync: true},
	getBaseUrl: {isAsync: false},
	getSpaceKey: {isAsync: false},
	getContentInfo: {isAsync: true},
	countDrawioMacros: {isAsync: true},
	showNotification: {isAsync: false},
	fetchConfluenceImage: {isAsync: true},
	getAttInfoById: {isAsync: true},
	getCustomLibrariesPages: {isAsync: true},
	getPageAttachments: {isAsync: true},
	createAttFile: {isAsync: true}
};

AC.remoteInvokeCallbacks = [];

AC.handleRemoteInvokeResponse = function(msg)
{
	var msgMarkers = msg.msgMarkers;
	var callback = AC.remoteInvokeCallbacks[msgMarkers.callbackId];
	
	if (msg.error)
	{
		if (callback.error) callback.error(msg.error.errResp);
	}
	else if (callback.callback)
	{
		callback.callback.apply(this, msg.resp);
	}
	
	AC.remoteInvokeCallbacks[msgMarkers.callbackId] = null; //set it to null only to keep the index
};

//Here, the editor is ready before sending init even which starts everything, so no need for waiting for ready message. Init is enough
AC.remoteInvoke = function(remoteFn, remoteFnArgs, msgMarkers, callback, error)
{
	msgMarkers = msgMarkers || {};
	msgMarkers.callbackId = AC.remoteInvokeCallbacks.length;
	AC.remoteInvokeCallbacks.push({callback: callback, error: error});
	AC.remoteWin.postMessage(JSON.stringify({action: 'remoteInvoke', funtionName: remoteFn, functionArgs: remoteFnArgs, msgMarkers: msgMarkers}));
};

AC.handleRemoteInvoke = function(msg)
{
	function sendResponse(resp, error)
	{
		var respMsg = {action: 'remoteInvokeResponse', msgMarkers: msg.msgMarkers};
		
		if (error != null)
		{
			respMsg.error = {errResp: error};
		}
		else if (resp != null) 
		{
			respMsg.resp = resp;
		}
		
		AC.remoteWin.postMessage(JSON.stringify(respMsg));
	}
	
	try
	{
		//Remote invoke are allowed to call functions in AC
		var funtionName = msg.funtionName;
		var functionInfo = AC.remoteInvokableFns[funtionName];
		
		if (functionInfo != null && typeof AC[funtionName] === 'function')
		{
			var functionArgs = msg.functionArgs;
			
			//Confirm functionArgs are not null and is array, otherwise, discard it
			if (!Array.isArray(functionArgs))
			{
				functionArgs = [];
			}
			
			//for functions with callbacks (async) we assume last two arguments are success, error
			if (functionInfo.isAsync)
			{
				//success
				functionArgs.push(function() 
				{
					sendResponse(Array.prototype.slice.apply(arguments));
				});
				
				//error
				functionArgs.push(function(err) 
				{
					sendResponse(null, err || mxResources.get('unknownError'));
				});
				
				AC[funtionName].apply(this, functionArgs);
			}
			else
			{
				var resp = AC[funtionName].apply(this, functionArgs);
				
				sendResponse([resp]);
			}
		}
		else
		{
			sendResponse(null, mxResources.get('invalidCallFnNotFound', [funtionName]));
		}
	}
	catch(e)
	{
		sendResponse(null, mxResources.get('invalidCallErrOccured', [e.message]));
		console.log(e);
		AC.logError(e.message, null, null, null, e);
	}
};

//Allow loading of plugins (we need it for comments) 
AC.plugins = [];

window.Draw = new Object();
window.Draw.loadPlugin = function(callback)
{
	AC.plugins.push(callback);
};

AC.loadPlugins = function(ui)
{
	for (var i = 0; i < AC.plugins.length; i++)
	{
		AC.plugins[i](ui);
	}
};

AC.noop = function(){};

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