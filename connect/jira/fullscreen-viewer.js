// Logs uncaught errors
EditorUi.enableLogging = true;

window.onerror = function(message, url, linenumber, colno, err)
{
	message = 'Jira Cloud: ' + ((message != null) ? message : '');
	
	EditorUi.logError(message, url, linenumber, colno, err);
};

// Enables dynamic loading of shapes and stencils (same domain)
mxStencilRegistry.dynamicLoading = true;

var head = document.getElementsByTagName('head')[0];

function main(darkMode)
{
	AP.resize('100%', '100%');
	
	//keeping the block of AP.require to minimize the number of changes!
	function doMain(customData)
	{
		var diagramId = (customData != null) ? customData.diagramId : null;
       	var diagramName = (customData != null) ? customData.diagramName : null;
       	var diagramXml = (customData != null) ? customData.xml : null;
       	var pageId = (customData != null) ? customData.pageId : null;
       	var layerIds = (customData != null) ? customData.layerIds : null;
		var isOpc = (customData != null) ? customData.isOpc : null;
    	var serverName = getBaseUrl();
    	var timeout = 25000;
    	var index1 = serverName.indexOf('//');
    	
    	if (index1 > 0)
    	{
    		var index2 = serverName.indexOf('/', index1 + 2);
    		
    		if (index2 > index1)
    		{
    			serverName = serverName.substring(index1 + 2, index2);
    		}
    	}
    	
		var acceptResponse = true;
		
		var timeoutThread = window.setTimeout(function()
		{
			acceptResponse = false;
			
			var flag = AP.flag.create({
				  title: 'The connection has timed out',
				  body: 'The server at ' +
							serverName + ' is taking too long to respond.',
				  type: 'error',
				  close: 'manual'
				});

			//TODO find how to listen to flag close event, currently just close the editor immediately
			//messages.onClose(message, function()
			//{
				AP.dialog.close();
			//});
		}, timeout);
    	
		var renderDiagram = function(resp)
		{
    		window.clearTimeout(timeoutThread);
    		
    		if (acceptResponse)
	    	{
				function doRender(xml)
				{
					document.body.style.backgroundImage = 'none';
					var viewer = new GraphViewer(null, null, {highlight: '#3572b0', nav: true, lightbox: false, pageId: pageId, layerIds: layerIds, 'dark-mode': darkMode});
					viewer.lightboxChrome = false;
					viewer.xml = xml;

					// Enables layers via flag to avoid toolbar
					viewer.layersEnabled = true;
					
					var ui = viewer.showLocalLightbox();
					
					// Destroy lightbox with ui instance
					var destroy = ui.destroy;
					ui.destroy = function()
					{
						AP.dialog.close();
						destroy.apply(this, arguments);
					};
				};

				if (diagramXml != null || !isOpc)
				{
					doRender(resp);
				}
				else
				{
					JSZip.loadAsync(resp).then(function(zip) 
					{
						var drawioFound = false;

						zip.forEach(function (relativePath, zipEntry) 
						{
							var name = zipEntry.name.toLowerCase();
							
							if (name == 'diagram/diagram.xml') //draw.io zip format has the latest diagram version at diagram/diagram.xml
							{
								drawioFound = true;

								zipEntry.async("string").then(function(str){
									if (str.indexOf('<mxfile ') == 0)
									{
										doRender(str);
									}
									else
									{
										renderDiagramError();
									}
								});
							}
							
						});

						if (!drawioFound)
						{
							renderDiagramError();
						}
					}, renderDiagramError); 
				}
	    	}
		};
		
		var renderDiagramError = function() 
		{
    		window.clearTimeout(timeoutThread);
    		
    		if (acceptResponse)
	    	{
    			AP.jira.refreshIssuePage();
				AP.dialog.close();
	    	}
		};
		
		if (diagramXml != null)
		{
			 renderDiagram(diagramXml);
		}
		else
		{
	       	// LATER: Add fallback using diagramName lookup via attachment list
			AP.request({
				url: '/rest/api/2/attachment/content/' + diagramId,
				success: renderDiagram,
				error : renderDiagramError,
				binaryAttachment: isOpc
			});
		}
    };
    AP.dialog.getCustomData(doMain);
}

mxResources.loadDefaultBundle = false;
var bundle = mxResources.getDefaultBundle(RESOURCE_BASE, mxLanguage) ||
	mxResources.getSpecialBundle(RESOURCE_BASE, mxLanguage);

// Prefetches asynchronous requests so that below code runs synchronous
// Loading the correct bundle (one file) via the fallback system in mxResources. The stylesheet
// is compiled into JS in the build process and is only needed for local development.
var bundleLoaded = false;
var scriptLoaded = false;

function mainBarrier()
{
	if (bundleLoaded && scriptLoaded)
	{
		mxConfThemeObserver(main, true);
	}
};

mxUtils.getAll([bundle], function(xhr)
{
	// Adds bundle text to resources
	mxResources.parse(xhr[0].getText());
	bundleLoaded = true;
	mainBarrier();
});

function init()
{
	scriptLoaded = true;
	mainBarrier();
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