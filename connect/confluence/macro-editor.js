// Sets global environment variables
RESOURCE_BASE = '/resources/dia';
STENCIL_PATH = '/stencils';
SHAPES_PATH = '/shapes';
IMAGE_PATH = '/images';
STYLE_PATH = '/styles';
OPEN_URL = '/import';
PROXY_URL = '/proxy';
SAVE_URL = '/save';

// Absolute for font conversion in lightbox to work
PROXY_URL = '/proxy';
// Math support
DRAW_MATH_URL = '/math/es5';

//Logs uncaught errors
window.onerror = function(message, url, linenumber, colno, err)
{
	message = 'Confluence Cloud Editor: ' + ((message != null) ? message : '');
	
	AC.logError(message, url, linenumber, colno, err);
};

var baseUrl = AC.getBaseUrl();

// Main
function init()
{
	AP.resize('100%', '100%');
	
	var lang = null, configObj = null, isFromCache = false, darkMode = false;
	var allDone = 0;
	
	var startEditor = function () 
	{
		allDone++;
		
		if (allDone == 3)
		{
			AP.dialog.getCustomData(function (customData) 
			{
				var isCustom = AC.getUrlParam('custom');
				
				if (isCustom == "1") 
				{
					var contentId = AC.getUrlParam('contentId') || AC.getUrlParam('custContentId');
					AC.initAsync(baseUrl, customData.contentId || customData.custContentId || contentId, customData.macroData, configObj, lang, customData.isSketch, isFromCache, darkMode, customData.macroId, customData.directEdit, customData.curPageId);
				}
				else
				{
					AC.initAsync(baseUrl, null, null, configObj, lang, customData.isSketch, isFromCache, darkMode);
				}
			});
		}
	}
	
	mxConfThemeObserver(function(darkMode_p)
	{
		darkMode = darkMode_p;
		startEditor();
	});

	AP.user.getLocale(function(locale)
	{
		lang = locale;
		startEditor();
	});	
	
	AC.getConfig(function (config, fromCache) 
    {
		configObj = config;
		isFromCache = fromCache;
		startEditor();
	}, startEditor, true);  //if there is an error loading the configuration, just load the editor normally. E.g., 404 when the space doesn't exist
	
	AP.request({
	    type: 'GET',
	    url: '/rest/atlassian-connect/1/addons/' + AC.appKey,
	    contentType: 'application/json;charset=UTF-8',
	    success: function (resp) 
	    {
	    	try
	    	{
	            resp = JSON.parse(resp);
	            
	            if (resp != null && resp.license != null)
	            {
	            	var xhr = new XMLHttpRequest();
	            	xhr.open('POST', '/license?licenseDump=' + encodeURIComponent(JSON.stringify(resp)), true);
	    			xhr.send(null);
	            }
	    	}
	    	catch (e)
	    	{
	    		// just throw away if it breaks, not important
			}
		}
	});
};

if (window.mxConfThemeObserver == null)
{
	mxConfThemeObserver = function(f)
	{
		f(false);
	}
}

if (typeof AP === 'undefined')
{
	var head = document.getElementsByTagName('head')[0];
    var script = document.createElement('script');
    script.onload = init;
    script.src = 'https://connect-cdn.atl-paas.net/all.js';
    script.setAttribute('data-options', 'resize:false;margin:false');
    head.appendChild(script);
}
else
{
    init();
}
