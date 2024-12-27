var initStart = Date.now();

(function()
{
	var lightbox = getUrlParam('lightbox') == '1';
	var customContent = getUrlParam('custom') == '1';

	if (lightbox)
	{
		document.body.style.backgroundImage = 'url(/images/drawlogo-text-bottom.svg)';
		document.body.style.backgroundPosition = 'center 30%';
		document.body.style.backgroundSize = '128px';
	}

	var EXPORT_URL = 'https://convert.diagrams.net/node/export';
	
	// Loads the Atlassian API
	var baseUrl = getBaseUrl();
		
	var cacheKey = '.drawio-confluence-' + baseUrl;
	var cachedConfig = null;
	var hasLocalStorage = false;
	
	//When 3rd party coookies are disabled, localStorage is not accessable
	try
	{
		hasLocalStorage = typeof window.localStorage !== 'undefined';
		cachedConfig = hasLocalStorage? localStorage.getItem(cacheKey) : null;
		
		try
		{
			cachedConfig = cachedConfig ? JSON.parse(cachedConfig) : null;
		}
    	catch (e)
    	{
       		localStorage.removeItem(cacheKey);
    	}
	}
	catch(e){}
	
	if (cachedConfig == null || cachedConfig.locale == null) //Migration
	{
		cachedConfig = {licenseValid: true, locale: 'en'};
	}
	
	// Loads the attachment and renders the diagram
	var diagramWidth = parseFloat(getUrlParam('width'));
	var diagramHeight = parseFloat(getUrlParam('height'));
	var diagramName = getUrlParam('diagramName');
	var displayName = getUrlParam('displayName');
	
	//ceoId and owningPageId are IDs of the page that potentially hold the attachment
	//they will differ when page history is shown, ceoId will be historical version ID,
	//owningPageId will be the ID of the current version that holds the attachment
	//ceoId is used as fallback in case owningPageId is not set(should be very rare)
	var ceoId = getUrlParam('ceoId');
	var owningPageId = getUrlParam('owningPageId');
	var revision = getUrlParam('revision');
	
	var linkedMode = getUrlParam('linked') == '1';
	var imgPageId = getUrlParam('imgPageId');
	var tbStyle = getUrlParam('tbstyle') || 'top';
	var links = getUrlParam('links') || 'auto';
	var enableLightbox = getUrlParam('lbox') != '0' && getUrlParam('lbox') != 'false';
	var simpleViewer = getUrlParam('simple') == '1' || 
				((!linkedMode || imgPageId) && 
				  cachedConfig.confConfig && cachedConfig.confConfig.simpleViewer);
	var tbHeight = 0;
	var zoom = parseFloat(getUrlParam('zoom') || 1);
	var border = (simpleViewer) ? 0 : 8;
	var pCenter = getUrlParam('pCenter') == '1';
	var hiRes = getUrlParam('hiRes')? getUrlParam('hiRes') == '1' : null;
	
	var contentId = getUrlParam('contentId') || getUrlParam('custContentId');
	var contentVer = getUrlParam('contentVer');
	var diagramUrl = getUrlParam('diagramUrl');
	var csvFileUrl = getUrlParam('csvFileUrl');
	var GHOwner = getUrlParam('GHOwner');
	var GHRepository = getUrlParam('GHRepository');
	var GHBranch = getUrlParam('GHBranch');
	var GHIsPrivate = getUrlParam('GHPriv') == '1';
	var inComment = getUrlParam('inComment') == '1';
	var aspect = getUrlParam('aspect');
	var aspectHash = getUrlParam('aspectHash');
	var attVer = getUrlParam('attVer', true);
	var service = getUrlParam('service', true);
	var sFileId = getUrlParam('sFileId', true);
	var odriveId = getUrlParam('odriveId', true);
	//Templates
	var templateUrl = getUrlParam('templateUrl', true);
	var tempIsBuiltIn = getUrlParam('tmpBuiltIn') == '1';
	var isTemplate = getUrlParam('isTemplate') == 'true';

	//Check if this template is from server
	var serverTempUrlPrefix = '/download/resources/' + AC.appKey + ':drawio-editor/templates/diagram';

	if (templateUrl && templateUrl.indexOf(serverTempUrlPrefix) == 0)
	{
		templateUrl = templateUrl.substring(serverTempUrlPrefix.length);
		tempIsBuiltIn = true;
	}

	var noRefresh = getUrlParam('noRefresh') == '1';
	var macroId = null; //TODO can we get it via parameter? 
	
	//Upload embed
	var isUpload = getUrlParam('isUp') == '1';
	
	if (isUpload)
	{
		linkedMode = false;
	}
	
	var isSketch = getUrlParam('sketch') == '1';
	
	// Macro version
	var macroVersion = parseInt(getUrlParam('mVer')) || 1;
	var pageInfo = getUrlParam('pageInfo') || '';
	var spaceKey, spaceId;
	var diagramLoaded = false;

	var isPreview, curPageId, curPageVer, pendingUpdates, pendingUpdatesVer;
	var imgAttVer = null, curAttVer = null;
	var licenseValid = null;
	
	//To generate images for settings
	var curViewer;
	
	//TODO Why EditorUi & mxStencilRegistry can be undefined???
	if (typeof EditorUi != 'undefined')
	{
		tbHeight = (tbStyle == 'top' && !simpleViewer) ? GraphViewer.prototype.toolbarHeight : 0;
		// Logs uncaught errors
		EditorUi.enableLogging = true;
		// Enables dynamic loading of shapes and stencils (same domain)
		mxStencilRegistry.dynamicLoading = true;
		// Workaround for blocked referrer in iframe
		Graph.prototype.baseUrl = baseUrl + '/pages/viewpage.action?pageId=' + (owningPageId || ceoId);
		// Disables delayed rendering since the container is created on the fly
		GraphViewer.prototype.checkVisibleState = false;

		// 3rd party cookies will be blocked soon by all browsers, so we need to handle Confluence images via AP.request
		var origImage = mxSvgCanvas2D.prototype.image;
		mxSvgCanvas2D.confImagesCash = {};

		mxSvgCanvas2D.prototype.image = function (x, y, w, h, src, aspect, flipH, flipV, clipPath)
		{
			var that = this;
			var cachedImg = mxSvgCanvas2D.confImagesCash[src];
			
			if (!cachedImg && src.substring(0, baseUrl.length) == baseUrl)
			{
				AC.fetchConfluenceImage(src, baseUrl,
					function(base64Img)
					{
						mxSvgCanvas2D.confImagesCash[src] = base64Img;
						origImage.call(that, x, y, w, h, base64Img, aspect, flipH, flipV, clipPath);
					}, AC.noop); // Keep image blank on error
			}
			else
			{
				origImage.call(that, x, y, w, h, cachedImg || src, aspect, flipH, flipV, clipPath);
			}
		}
	}
	else
	{
		try
		{
			AC.logError('Confluence Cloud Viewer: mxViewer is not defined. JS file loaded? ' + window.mxImageBasePath); //window.mxImageBasePath is first line in viewer-static-min and not defined elsewhere
			
			//Check if viewer-static.min.js is reachable
			var treq = new XMLHttpRequest();
			treq.open('GET', '/js/viewer-static.min.js');
			
			treq.onreadystatechange = function()
			{
				if (this.readyState == 4 && (this.status < 200 || this.status > 299))
				{
					AC.logError('Confluence Cloud Viewer: viewer-static.min.js is unreachable ' + this.status);
				}
			};
			
			treq.send();
		}
		catch(e)
		{
			console.log(e);
		}		
	}

	var openPageImg = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB3aWR0aD0iMTMxIiBoZWlnaHQ9IjEzMSIgdmlld0JveD0iLTAuNSAtMC41IDEzMSAxMzEiIHN0eWxlPSJiYWNrZ3JvdW5kLWNvbG9yOiNmZmYiPjxnIHBvaW50ZXItZXZlbnRzPSJub25lIj48cGF0aCBkPSJNMjUgMTVoNTBsMzAgMzB2NzBIMjVWMTV6IiBmaWxsPSIjZmZmIiBzdHJva2U9IiMwMDAiIHN0cm9rZS13aWR0aD0iOCIgc3Ryb2tlLW1pdGVybGltaXQ9IjEwIi8+PHBhdGggZD0iTTc1IDE1djMwaDMweiIgZmlsbC1vcGFjaXR5PSIuMDUiLz48cGF0aCBkPSJNNzUgMTV2MzBoMzAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzAwMCIgc3Ryb2tlLXdpZHRoPSI4IiBzdHJva2UtbWl0ZXJsaW1pdD0iMTAiLz48aW1hZ2UgeD0iMzMuMTciIHk9IjUwLjUiIHdpZHRoPSI2MC42NiIgaGVpZ2h0PSI1NiIgeGxpbms6aHJlZj0iZGF0YTppbWFnZS9zdmcreG1sO2Jhc2U2NCxQSE4yWnlCNGJXeHVjejBpYUhSMGNEb3ZMM2QzZHk1M015NXZjbWN2TWpBd01DOXpkbWNpSUhodGJHNXpPbmhzYVc1clBTSm9kSFJ3T2k4dmQzZDNMbmN6TG05eVp5OHhPVGs1TDNoc2FXNXJJaUIyWlhKemFXOXVQU0l4TGpFaUlHbGtQU0pGWW1WdVpWOHhJaUI0UFNJd2NIZ2lJSGs5SWpCd2VDSWdkbWxsZDBKdmVEMGlOREF1TmpBd01EQXlNamc0T0RFNE16WWdNemt1TWpBd01EQXdOell5T1RNNU5EVWdNVFk0TGpnNU9UazVNemc1TmpRNE5ETTRJREUxTlM0NE1EQXdNVGd6TVRBMU5EWTRPQ0lnYzNSNWJHVTlJbVZ1WVdKc1pTMWlZV05yWjNKdmRXNWtPbTVsZHlBd0lEQWdNalV3SURJMU1Ec2lJSGh0YkRwemNHRmpaVDBpY0hKbGMyVnlkbVVpSUhkcFpIUm9QU0l4TmpndU9EazVPVGt6T0RrMk5EZzBNemdpSUdobGFXZG9kRDBpTVRVMUxqZ3dNREF4T0RNeE1EVTBOamc0SWo0bUkzaGhPenh6ZEhsc1pTQjBlWEJsUFNKMFpYaDBMMk56Y3lJK0ppTjRZVHNKTG5OME1udG1hV3hzT2lNd01EQXdNREE3ZlNZamVHRTdQQzl6ZEhsc1pUNG1JM2hoT3p4d1lYUm9JR05zWVhOelBTSnpkRElpSUdROUlrMHhPVGN1TVN3eE16Z3VNMmd0TWpNdU4yd3RNalV0TkRJdU4yTTFMamN0TVM0eUxEa3VPQzAyTGpJc09TNDNMVEV5VmpVeExqVmpNQzAyTGpndE5TNDBMVEV5TGpNdE1USXVNaTB4TWk0ell6QXNNQzB3TGpFc01DMHdMakVzTUdndE5ERXVOeVlqTVRBN0ppTTVPMk10Tmk0NExEQXRNVEl1TXl3MUxqUXRNVEl1TXl3eE1pNHlZekFzTUN3d0xEQXVNU3d3TERBdU1YWXpNaTR4WXpBc05TNDRMRFFzTVRBdU9DdzVMamNzTVRKc0xUSTFMRFF5TGpkSU5USXVPV010Tmk0NExEQXRNVEl1TXl3MUxqUXRNVEl1TXl3eE1pNHlZekFzTUN3d0xEQXVNU3d3TERBdU1TWWpNVEE3SmlNNU8zWXpNaTR4WXpBc05pNDRMRFV1TkN3eE1pNHpMREV5TGpJc01USXVNMk13TERBc01DNHhMREFzTUM0eExEQm9OREV1TjJNMkxqZ3NNQ3d4TWk0ekxUVXVOQ3d4TWk0ekxURXlMakpqTUN3d0xEQXRNQzR4TERBdE1DNHhkaTB6TWk0eFl6QXROaTQ0TFRVdU5DMHhNaTR6TFRFeUxqSXRNVEl1TXlZak1UQTdKaU01TzJNd0xEQXRNQzR4TERBdE1DNHhMREJvTFRSc01qUXVPQzAwTWk0MGFERTVMak5zTWpRdU9TdzBNaTQwYUMwMExqRmpMVFl1T0N3d0xURXlMak1zTlM0MExURXlMak1zTVRJdU1tTXdMREFzTUN3d0xqRXNNQ3d3TGpGMk16SXVNV013TERZdU9DdzFMalFzTVRJdU15d3hNaTR5TERFeUxqTW1JekV3T3lZak9UdGpNQ3d3TERBdU1Td3dMREF1TVN3d2FEUXhMamRqTmk0NExEQXNNVEl1TXkwMUxqUXNNVEl1TXkweE1pNHlZekFzTUN3d0xUQXVNU3d3TFRBdU1YWXRNekl1TVdNd0xUWXVPQzAxTGpRdE1USXVNeTB4TWk0eUxURXlMak1tSXpFd095WWpPVHRETVRrM0xqSXNNVE00TGpNc01UazNMaklzTVRNNExqTXNNVGszTGpFc01UTTRMak42SWk4K0ppTjRZVHM4TDNOMlp6ND0iIHByZXNlcnZlQXNwZWN0UmF0aW89Im5vbmUiLz48cGF0aCBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iOCIgZD0iTTMuNzUgMy43NWgxMjIuNXYxMjIuNUgzLjc1eiIvPjwvZz48L3N2Zz4=';

	if (!lightbox)
	{
		document.body.style.backgroundImage = 'url(/images/aui-wait.gif)';
		document.body.style.backgroundPosition = 'left top';
		document.body.style.backgroundSize = 'auto auto';
	}
	
	function main()
	{
		// Sets initial placeholder size to allow for scrollbars in fit to page width
		AP.resize('100%', (lightbox || customContent) ? '100%' : (diagramHeight * zoom + tbHeight + 2));
		var timeoutThread;
		
		function showError(msg, checkDiagramLoaded, link, linkLbl)
		{
			window.clearTimeout(timeoutThread);
		
			if (checkDiagramLoaded && diagramLoaded) return;

			if (lightbox)
			{
				AC.showNotification({
				  title: mxResources.get('error'),
				  body: msg,
				  type: 'error',
				  close: 'manual'
				});
				
				AP.dialog.close();
			}
			else
			{
				document.body.style.backgroundImage = 'none';
				document.body.style.padding = '4px';
				document.body.style.whiteSpace = 'pre-line';
				document.body.innerHTML = '';
				var div = document.createElement('div');
				div.setAttribute('id', 'drawioError');
				var img = document.createElement('img');
				img.setAttribute('src', Editor.errorImage);
				div.appendChild(img);
				mxUtils.write(div, msg);
				console.log(msg);
				console.log(link);

				if (link != null)
				{
					var a = document.createElement('a');
					a.setAttribute('href', mxUtils.removeJavascriptProtocol(link));
					a.setAttribute('target', '_blank');
					mxUtils.write(a, linkLbl);
					div.appendChild(a);
				}

				document.body.appendChild(div);
				AP.resize('100%', link? 65 : 45);
			}
		};
		
		//keeping the block of AP.require to mimimize the number of changes!
		{
			//This is a workaround Jira Service Desk preview which has no context. 
			//AP.navigator.getLocation will just log an error and callback function won't be called 
			var ignoreNavFallback = false;
			var isServiceDesk = false; //In service desk, we cannot show dialogs as we cannot pass customData
			
			var fallbackTimeoutThread = window.setTimeout(function()
			{
				if (!ignoreNavFallback) 
				{
					isServiceDesk = true;
					startViewer();
				}
			}, 500); //allow 0.5 sec for AP.context.getContext 
			
		  AP.getLocation(function(location)
		  {
			//Editing from Jira project pages doesn't work, treat it as service desk
			isServiceDesk = AC.getUrlParam("parentProduct", true, location) != null;

			// Lightbox direct link
			if (location.indexOf('plugins.diagramly/lightbox?') > 0)
			{
				ceoId = AC.getUrlParam('ceoId', true, location);
				diagramName = AC.getUrlParam('diagramName', true, location);
			}

			// Uses pageId from current page as page in macro may be outdated after export
			AP.context.getContext(function(data)
			{
				ignoreNavFallback = true;
				window.clearTimeout(fallbackTimeoutThread);
				
				if (data != null && data.confluence != null)
				{
					var macro = data.confluence.macro || {};
					isServiceDesk = isServiceDesk || (macro.outputType == 'html_export');
					isPreview =  macro.outputType == 'preview' || isServiceDesk;
					var content = data.confluence.content || {};
					curPageId = content.id;
					curPageVer = content.version;
					AC.contentTypeCache[curPageId] = {type: content.type, isBP: content.type == 'blogpost'};
					macroId = macro.id || macro.hash;
					spaceKey = data.confluence.space.key;
					spaceId = data.confluence.space.id;
					
					if (!linkedMode && curPageId != null)
					{
						AC.alert('About to read property');
						//Get updated macro data from property if exists
						AC.getContentProperty(curPageId, AC.contentTypeCache[curPageId].type, AC.MACRO_EDITS_PROP, function(resp)
					    {
							try
							{
								resp = JSON.parse(resp);
								pendingUpdatesVer = resp.version.number;
								pendingUpdatesId = resp.id;

								pendingUpdates = JSON.parse(decodeURIComponent(resp.value));
						    	
								if (pendingUpdates[diagramName])
								{
									var updateInfo = pendingUpdates[diagramName];
	
									function refreshViewer()
									{
										if (!noRefresh)
										{
											AC.refreshUrlWithNewParams(updateInfo, {noRefresh: 1}); //prevent infinite refresh loab
										}
									};

									//Only first macro in page update the page (if not in preview mode [In Editor])
									if (!isPreview && Object.keys(pendingUpdates)[0] == diagramName)
									{
										//Update page
										AC.updatePageMacros(curPageId, pendingUpdates, pendingUpdatesId, pendingUpdatesVer, null, refreshViewer);
									}
									else
									{
										refreshViewer();
									}
								}
							}
							catch(e) //Ignore errors
							{
								console.log(e);
							}
					    }, AC.noop); //On error ignore
					}
				}

				startViewer();
			});
		  });

			function startViewer()
			{
				var candidateId = (owningPageId != null && owningPageId.length > 0) ? owningPageId : ceoId;

				if (!linkedMode && curPageId != null)
				{
					candidateId = curPageId;
				}
				
				function getDiagContainerUrl(pageId, diagramName, callback, forceDrawioView, embedMacro, embedContentId)
				{
					//Check if the parent page has its macro
					AC.findMacroInPage(pageId, diagramName, false, function(macroFound, originalBody, matchingMacros, page)
					{
						var url;
						
						if (macroFound)
						{
							//Open containing page in view mode if diagram is published
							url = baseUrl + page._links.webui;
						}
						else
						{
							if (forceDrawioView)
							{
								url = baseUrl + '/display/' + encodeURIComponent(AC.getSpaceKey(page._links.webui)) + '/pages/' + pageId +
										'/customcontents/ac:' + AC.macroType ;
							}
							else if (contentId)
							{
								url = baseUrl + '/plugins/servlet/ac/com.mxgraph.confluence.plugins.diagramly/gotoCCPage?contentId=' + contentId;
							}
							else
							{
								url = baseUrl + '/pages/viewpageattachments.action?pageId=' + pageId + 
										'&activeContentType=attachment';
							}
						}
						
						callback(url);
					},
					function()
					{
						// Works for pages and blogs
						callback(baseUrl + '/pages/resumedraft.action?draftId=' + pageId);
					}, null, null, embedMacro, embedContentId, isSketch);
				};
				
				//TODO This huge function needs refactoring. The inner funcitons uses a lot of outer functions variables + global variable usage which make refactoring tricky
				// Loads the given XML into the viewer
				function showDiagram(id, backupId, name, revision, links, retryParams, displayName, contentId, spaceKey, openComments, aspect)
				{
					if (diagramLoaded) return;
					//Check if the user can edit this diagram
					function checkUserCanEdit()
					{
						if (linkedMode) return;
						
						function disableBtn(tooltip)
						{
							if (lightbox)
							{
								var btns = EditorUi.prototype.lightboxToolbarActions;
								
								for (var i = 0; i < btns.length; i++)
								{
									if (btns[i].isEditBtn)
									{
										btns[i].elem.parentNode.removeChild(btns[i].elem);
										break;
									}
								}
							}
							else
							{
								curViewer.disableButton('edit', tooltip);
							}
						}
						
						if (inComment || templateUrl)
						{
							//TODO enable editing macros in comments externally (requires finding which comment it belongs to and editing that comment content)
							disableBtn(mxResources.get('confEditOnlyInPageEditor'));
						}
						else
						{
							AC.userCanEdit(id, function(canEdit)
							{
								if (!canEdit)
								{
									disableBtn();
								}
							}, function()
							{
								//Error, leave button enabled
							});
						}
					};

					if (templateUrl && !name)
					{
						name = decodeURIComponent(templateUrl.substr(templateUrl.lastIndexOf('/') + 1));
					}
					
					var withVersion = true;
					
					if (cachedConfig.confConfig && cachedConfig.confConfig.disableVersioning)
					{
						withVersion = false;
					}

					displayName = displayName || name;
					retryParams = retryParams || {}; //so we can use it without NPE check
					
					var aspectPageId = null, aspectLayerIds = null;
					
					if (aspect != null)
					{
						//Set pageId and layers
						var aspectArray = aspect.split(' ');

						if (aspectArray.length > 0)
						{
							aspectPageId = aspectArray[0];
							aspectLayerIds = aspectArray.slice(1);
						}
					}
					
					if (id != null)
					{
						id = id.toString();
					}
					
					function updateUrlAndRefresh(newSettings, onSuccess, onError)
					{
						//Do change on this page (ceoId)
						AC.updatePageEmbedMacros(ceoId, newSettings, function()
						{
							onSuccess();
							
							//Build the new url with new macro settings
							AC.refreshUrlWithNewParams(newSettings);
						}, onError, macroId);
					}

					if (id != null && id.length > 0 && name != null && name.length > 0) 
					{
						// Option currently not available in the UI
						if (simpleViewer)
						{
							diagramLoaded = true;
							document.body.style.backgroundImage = 'none';
							var img = document.createElement('img');
							img.style.cssText = 'max-width:100%;';
							var imgSrc = '/download/attachments/' + (imgPageId || id) + '/'
									+ encodeURIComponent(name + (aspectHash? '-' + aspectHash : '')) + ".png?api=v2"
									+ (revision && licenseValid && withVersion? "&version=" + revision : "");

							img.onload = function()
							{
								AP.resize('100%', img.height);
							};

							// Load via AP (to bypass 3rd party cookies issue)
							AC.fetchConfluenceImage(imgSrc, '', function(base64Img)
							{
								img.setAttribute('src', base64Img);
							}, function()
							{
								if (revision)
								{
									// Retry without version
									diagramLoaded = false;
									document.body.innerHTML = '';
									showDiagram(id, backupId, name, null, links, retryParams, displayName, contentId, spaceKey, openComments, aspect);	
								}
								else
								{
									showError(mxResources.get('fileNotFound'));
								}
							});

							img.style.width = Math.round(diagramWidth * zoom) + 'px';
							
							if (enableLightbox)
							{
								img.style.cursor = 'pointer';
								
								img.addEventListener('click', function() 
								{
									AP.dialog.create(
					                {
					                    header: displayName,
				                		key: 'lightbox',
					                    size: 'fullscreen',
					                    customData: {id: id, name: name, revision: revision, links: links, displayName: displayName, contentId: contentId, custContentId: contentId, openComments: openComments},
					                    chrome: true
					                });
								});
							}
							
							if (pCenter)
							{
								document.body.style.width = '100%';
								document.body.style.textAlign = 'center';	
							}
							
							document.body.appendChild(img);
						}
						else
						{
							//Timeout Config will tkae effect after a refresh 
							var timeout = (cachedConfig.confConfig? cachedConfig.confConfig.viewerTimeout: 0) || 25000;
							var serverName = getUrlParam('xdm_e');
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
							
							var acceptResponse = true, diagramRendered = false;
							
							function createTimeoutThread()
							{
								return window.setTimeout(function()
								{
									if (diagramRendered || diagramLoaded) return;
									
									acceptResponse = false;
								
									showError(mxResources.get('confTimeout') + ': ' +
											mxResources.get('confSrvTakeTooLong', [serverName]), true);
								}, timeout);
							}
							
							timeoutThread = createTimeoutThread();
							
								function loadDiagramSuccess(xml, altDisplayName) 
								{
									diagramRendered = true;
									window.clearTimeout(timeoutThread);

									if (diagramLoaded) return;
									diagramLoaded = true;
									
							 		if (acceptResponse)
							 		{
										if (revision && !linkedMode && (id == ceoId) && (!retryParams || !retryParams.noRefreshCheck))
										{
											AC.getAttachmentInfo(id, name, false, function(info)
											{
												// The latest version is not loaded, confirm with the page storage format
												if (info.version.number != revision)
												{
													AC.findMacroInPage(id, name, null, function(macroFound, originalBody, matchingMacros)
													{
														if (macroFound && matchingMacros[0].macroParams.revision != revision)
														{
															// Refresh the viewer
															diagramLoaded = false;
															showDiagram(id, backupId, name, matchingMacros[0].macroParams.revision, links, {noRefreshCheck: true}, displayName, contentId, spaceKey, openComments, aspect);
														}
													}, AC.noop, false, false, isUpload, null, isSketch, macroId);
												}
											}, AC.noop);
										}

										document.body.style.backgroundImage = 'none';
										
										var openParentPageFunc = function()
										{
											var openURL = function(pageURL)
											{
												try
												{
													top.window.location.href = pageURL;										
												}
												catch(e) //In case of a security exception
												{
													window.location = pageURL;
												}
											};
											
											getDiagContainerUrl(id, name, function(url)
											{
												openURL(url);
											}, true, linkedMode, contentId);
										};
										
										function monitorPopup(editWin)
										{
											if (editWin != null)
											{
												var checkClosedTimer = setInterval(function() 
												{
												    if (editWin.closed !== false) 
												    {
												        clearInterval(checkClosedTimer);
												        location.reload();
												    }
												}, 200);
											}
										};
										
										var editFunc = function()
										{
											//For embeded macros, we support editing Google Drive, OneDrive only
											if (linkedMode)
											{
												var editWin = null;
												
												if (service == 'GDrive')
												{
													editWin = window.open('https://app.diagrams.net/#G' + encodeURIComponent(sFileId));
												}
												else if (service == 'OneDrive')
												{
													editWin = window.open('https://app.diagrams.net/#W' + encodeURIComponent(odriveId + '/' + sFileId));
												}
												
												monitorPopup(editWin);
											}
											else if (lightbox)
											{
												AP.dialog.close({noBack: true, openEditorId: contentId});												
											}
											else
											{
												AP.dialog.create(
								                {
							                		key: 'customContentEditor',
							                		//sending pageId and revision to verify custom content matches opened diagram
								                    customData: {contentId: contentId,
																directEdit: true,
							                    				macroData: {
							                    					width: diagramWidth,
							                    					height: diagramHeight,
							                    					diagramName: name,
							                    					diagramDisplayName: displayName,
							                    					pageId: id,
							                    					revision: revision,
							                    					tbstyle: tbStyle,
							                    					links: links,
							                    					simple: simpleViewer,
							                						lbox: enableLightbox,
							                    					zoom: zoom,
							                    					contentVer: contentVer,
							                    					contentId: contentId,
							                    					custContentId: contentId,
							                    					aspect: aspect,
																	isUpload: isUpload
							                    				},
							                    				isSketch: isSketch,
																macroId: macroId
								                    },
								                    chrome: false,
								                    width: "100%",
								                    height: "100%",
								                });
												
												AP.events.once('dialog.close', function(flags)
						                		{
								                	//refresh the viewer
								                	if (flags && flags.newRev && flags.newContentVer && flags.newContentId)
							                		{
														if (isUpload && flags.newMacroData)
														{
															updateUrlAndRefresh(flags.newMacroData, AC.noop, AC.noop);
														}
														else
														{
									                		contentVer = flags.newContentVer;
									                		contentId = flags.newContentId;
															diagramLoaded = false;
									                		showDiagram(id, backupId, flags.newName? flags.newName : name, flags.newRev, links, retryParams, displayName, contentId, null, null, flags.newAspect);

															if (flags.noPageUpdate)
															{
																return;
															}

															AC.alert('About to read property2');
															//Update page
															AC.getContentProperty(id, AC.contentTypeCache[id].type, AC.MACRO_EDITS_PROP, function(resp)
														    {
																try
																{
																	resp = JSON.parse(resp);
																	pendingUpdatesVer = resp.version.number;
																	pendingUpdatesId = resp.id;
																	pendingUpdates = JSON.parse(decodeURIComponent(resp.value));
																	AC.updatePageMacros(id, pendingUpdates, pendingUpdatesId, pendingUpdatesVer);
																}
																catch(e) //Ignore errors
																{
																	console.log(e);
																}
														    }, AC.noop); //On error ignore
														}
							                		}
						                		});
											}
										};
										
										var settingDialog = null;
										
										function createSettingDialog(settings, submitFn, cancelFn)
										{
											var div = document.createElement('div');
											div.style.position = 'absolute';
											var hasImgOpt = !linkedMode || imgPageId;

											div.innerHTML = '<div style="padding: 6px;">' +
											(hasImgOpt ?
											'    <div style="padding: 6px 0px 1px; white-space: nowrap; overflow: hidden; width: 225px; height: 18px;">' +
											'        <input type="checkbox" style="margin: 0px 6px 0px 0px;" id="simpleViewer" ' + (settings.simple? 'checked="checked"' : '') + '>' + 
											'		 <label for="simpleViewer">' + mxResources.get('simpleViewer') + '</label>' +
											'    </div>' : '') +
											'    <div style="padding: 6px 0px 1px; white-space: nowrap; overflow: hidden; width: 225px; height: 18px;">' +
											'        <input type="checkbox" style="margin: 0px 6px 0px 0px;" id="lightbox" ' + (settings.lbox? 'checked="checked"' : '') + '>' +
											'		 <label for="lightbox">' + mxResources.get('lightbox') + '</label>' +
											'    </div>' +
											'    <div style="padding: 6px 0px 1px; white-space: nowrap; overflow: hidden; width: 225px; height: 18px;">' +
											'        <input type="checkbox" style="margin: 0px 6px 0px 0px;" id="center" ' + (settings.pCenter? 'checked="checked"' : '') + '>' +
											'		 <label for="center">' + mxResources.get('center') + '</label>' +
											'    </div>' +
											(hasImgOpt ?
											'    <div style="padding: 6px 0px 1px; white-space: nowrap; overflow: hidden; width: 225px; height: 18px;">' +
											'        <input type="checkbox" style="margin: 0px 6px 0px 0px;" id="hiRes" ' + 
														(settings.hiRes || (settings.hiRes == null && cachedConfig.confConfig && cachedConfig.confConfig.hiResPreview)? 'checked="checked"' : '') + '>' +
											'		 <label for="hiRes">' + mxResources.get('hiResPreview') + '</label>' +
											'    </div>' : '') +
											'    <div style="padding: 8px 0px 4px 18px; display: flex; justify-content: space-between;">' + mxResources.get('toolbar') +
											'        <select id="toolbar" style="width: 97px;">' +
											'            <option value="top" ' + (settings.tbstyle == 'top'? 'selected="selected"' : '') + '>' + mxResources.get('top') + '</option>' +
											'            <option value="inline" ' + (settings.tbstyle == 'inline'? 'selected="selected"' : '') + '>' + mxResources.get('embed') + '</option>' +
											'            <option value="hidden" ' + (settings.tbstyle == 'hidden'? 'selected="selected"' : '') + '>' + mxResources.get('hidden') + '</option>' +
											'        </select>' +
											'    </div>' +
											'    <div style="padding: 4px 0px 4px 18px; display: flex; justify-content: space-between;">' +
											'        Links' +
											'        <select id="links" style="width: 97px;">' +
											'            <option value="auto" ' + (settings.links == 'auto'? 'selected="selected"' : '') + '>' + mxResources.get('automatic') + '</option>' +
											'            <option value="blank" ' + (settings.links == 'blank'? 'selected="selected"' : '') + '>' + mxResources.get('openInNewWindow') + '</option>' +
											'            <option value="self" ' + (settings.links == 'self'? 'selected="selected"' : '') + '>' + mxResources.get('openInThisWindow') + '</option>' +
											'        </select>' +
											'    </div>' +
											'    <div style="padding: 6px 0px 6px 18px; display: flex; justify-content: space-between;">' + mxResources.get('zoom') + 
											'        <div><input id="zoom" type="number" value="' + settings.zoom + '" style="text-align: right; width: 44px;height: 14px;padding: 0;"> %</div>' +
											'    </div>' +
											'    <div style="padding: 0px 0px 6px; white-space: nowrap; overflow: hidden; width: 225px; font-weight: bold;">' + mxResources.get('pageLayers') +
											'    </div>' +
											'    <div style="padding: 6px 0px 1px; white-space: nowrap; overflow: hidden; width: 225px; height: 18px;">' +
											'    	<input type="checkbox" style="margin: 0px 6px 0px 0px;" id="curViewerState"><label for="curViewerState">' + mxResources.get('curViewState') + '</label>' +
											'    </div>' +
											'	 <div id="settingDlgErrMsg" style="color: red"></div>' +
											'	 <div style="text-align: right"><button id="cancelBtn" style="margin: 6px 4px 0">' + mxResources.get('cancel') + '</button> <button id="saveBtn" style="margin: 6px 0">' + mxResources.get('save') + '<img src="/images/spin.gif" id="busyIcn" style="display: none"></button><div>'
											'</div>';
											
											var addHiRes = settings.hiRes != null;
											
											if (hasImgOpt) 
											{
												AC.$('#hiRes', div).addEventListener('change', function() 
												{
													addHiRes = true;
												});
											}
											
											AC.$('#saveBtn', div).addEventListener('click', function() 
											{
												var opts = {
													tbstyle: AC.$('#toolbar', div).value,
													links: AC.$('#links', div).value,
													lbox: AC.$('#lightbox', div).checked? '1' : '0',
													zoom: AC.$('#zoom', div).value / 100,
													pCenter: AC.$('#center', div).checked? '1' : '0'
												};
												
												if (hasImgOpt)
												{
													opts['simple'] = AC.$('#simpleViewer', div).checked? '1' : '0';
													
													if (addHiRes)
													{
														opts['hiResPreview'] = AC.$('#hiRes', div).checked? '1' : '0';
													}
												}
												
												submitFn(opts, AC.$('#curViewerState', div).checked);
											});
											
											AC.$('#cancelBtn', div).addEventListener('click', cancelFn);
											
											return div;
										};
										
										var pResized = false;

										function settingsFunc()
										{
											var saveStarted = false;

											function hideSettingsDLg(force)
											{
												if (!saveStarted || force == true)
												{
													settingDialog.parentNode.removeChild(settingDialog);
													settingDialog = null;
													
													if (pResized)
													{
														AP.resize(pResized.w, pResized.h);
													}
												}
											};
											
											if (settingDialog != null)
											{
												hideSettingsDLg();
											}
											else
											{
												//Get diagram attachment id to handle descriptor 
												AC.getAttachmentInfo(id, name, false, function(info)
												{
													AC.curDiagVer = info.version.number;
													AC.curDiagId = info.id;
												}, function()
												{
													AC.curDiagId = false;
												});

												settingDialog = createSettingDialog({
													tbstyle: tbStyle,
													links: links,
													lbox: enableLightbox,
													simple: simpleViewer,
													zoom: zoom * 100,
													pCenter: pCenter,
													hiRes: hiRes
												}, function(newSettings, saveCurAspect)
												{
													AC.$('#busyIcn', settingDialog).style.display = '';
													AC.$('#saveBtn', settingDialog).disabled = true;
													AC.$('#settingDlgErrMsg', settingDialog).innerText = '';
													
													saveStarted = true;
													
													function saveError(err)
													{
														AC.$('#settingDlgErrMsg', settingDialog).innerHTML = err && err.downgrade?
															mxResources.get('confEditedExtRefresh') :
															mxResources.get('confASaveFailedErr');
														AC.$('#busyIcn', settingDialog).style.display = 'none';
														AC.$('#saveBtn', settingDialog).disabled = false;
														saveStarted = false;
													};
													
													newSettings.diagramName = diagramName;
													newSettings.diagramDisplayName = displayName;
													newSettings.baseUrl = baseUrl;
													newSettings.width = diagramWidth;
													newSettings.height = diagramHeight;
													newSettings.aspect = aspect;
													newSettings.custContentId = contentId;
													newSettings.contentVer = contentVer;
																											
													if (linkedMode)
													{
														newSettings.includedDiagram = 1;
														
														if (service)
														{
															newSettings.service = service;
															
															if (service == 'GDrive')
															{
																newSettings.sFileId = sFileId;
															}
															else if (service == 'OneDrive')
															{
																newSettings.sFileId = sFileId;
																newSettings.odriveId = odriveId;
															}
														}
														else if (diagramUrl)
														{
															newSettings.diagramUrl = diagramUrl; 
														}
														else if (GHRepository)
														{
															newSettings.GHOwner = GHOwner;
															newSettings.GHRepository = GHRepository;
															newSettings.GHBranch = GHBranch;
															newSettings.GHIsPrivate = GHIsPrivate? '1' : '0';
														}
														else if (csvFileUrl)
														{
															newSettings.csvFileUrl = csvFileUrl;
														}
														else
														{
															newSettings.aspectHash = aspectHash;
															newSettings.pageId = id;
															newSettings.imgPageId = imgPageId;
															delete newSettings.contentVer;
														}
													}
													else
													{
														newSettings.pageId = id;
														
														if (isUpload)
														{
															newSettings.isUpload = '1';
														}
														else
														{
															newSettings.revision = revision;
														}
														
														newSettings.inComment = inComment? '1' : '0';
													}
													
													function saveDone()
													{
														hideSettingsDLg(true);
														//Refresh viewer
														if (!linkedMode && !isUpload)
														{
															//Allow refresh on save
															AC.refreshUrlWithNewParams({noRefresh: 0});
														}
													};
													
													function saveMacro(treatAsLinked)
													{
														if (linkedMode || treatAsLinked === true)
														{
															updateUrlAndRefresh(newSettings, saveDone, saveError);
														}
														else
														{
															function descDone()
															{
																if (isUpload)
																{
																	saveMacro(true);
																}
																else
																{
																	AC.saveMacroToProp(id, diagramName, newSettings, saveDone, saveError);	
																}
															};
															
															function descErr()
															{
																saveError({downgrade: true});
															};
															
															if (AC.curDiagId)
															{
																AC.getFileDescriptor(function(desc)
																{
																	desc.viewerSettings = newSettings;
																	AC.setFileDescriptor(desc, descDone, descErr);
																}, descErr);
															}
															else
															{
																descDone();
															}
														}
													};
													
													var newHiRes = newSettings.hiResPreview? newSettings.hiResPreview == '1' : null;
													var hiResChanged = newHiRes != hiRes;

													if (saveCurAspect || hiResChanged)
													{
														newSettings.aspect = AC.getViewerAspect(curViewer);
											
														//No change in the aspect, so no new image is needed, also no image for external resources
														if ((!hiResChanged && newSettings.aspect == aspect) || (linkedMode && (diagramUrl || GHRepository || csvFileUrl || service)))
														{
															saveMacro();
														}
														else if (curViewer.editor.isExportToCanvas())
												    	{
															if (linkedMode)
															{
																newSettings.aspectHash = AC.sha1(newSettings.aspect);
															}
															
															curViewer.editor.exportToCanvas(function(canvas)
													    	{
													    		var data = canvas.toDataURL('image/png');
																AC.saveDiagram(id, diagramName + (linkedMode? '-' + newSettings.aspectHash : '') + '.png', AC.b64toBlob(data.substring(data.lastIndexOf(',') + 1), 'image/png'),
																	saveMacro, saveError, false, 'image/png', 
																	(linkedMode? 'draw.io aspect image' + (curAttVer? ' - ' + curAttVer : '') : mxResources.get('drawPrev')), false, false);
													    	}
													    	, null, null, null, saveError, null, null, 
															newHiRes || (newHiRes == null && cachedConfig.confConfig && cachedConfig.confConfig.hiResPreview)? 2 : 1);
												    	}
												    	else
											    		{
															saveError();
											    		}
													}
													else
													{
														saveMacro();
													}
												}, hideSettingsDLg);
												
												var r = this.getBoundingClientRect();
												settingDialog.style.width = '225px';
												settingDialog.style.padding = '2px 0px 2px 0px';											
												settingDialog.style.backgroundColor = 'light-dark(#eeeeee, var(--ds-surface, #1d2125))';
												settingDialog.style.border = '1px solid light-dark(#dadada, #565656)';
												settingDialog.style.color = 'light-dark(#3f3f3f, #c0c0c0)';
												settingDialog.style.fontFamily = 'Helvetica Neue,Helvetica,Arial Unicode MS,Arial';
												settingDialog.style.fontSize = '11px';
												settingDialog.style.whiteSpace = 'nowrap';
												settingDialog.style.zIndex = GraphViewer.prototype.toolbarZIndex + 1;
												mxUtils.setOpacity(settingDialog, 98);
												var origin = mxUtils.getDocumentScrollOrigin(document);
												settingDialog.style.left = origin.x + r.left + 'px';
												settingDialog.style.top = origin.y + r.bottom + 'px';

												document.body.appendChild(settingDialog);
												var bodyW = document.body.offsetWidth;
												var bodyH = document.body.offsetHeight;

												if (bodyW < settingDialog.offsetWidth || 
														bodyH < settingDialog.offsetHeight + GraphViewer.prototype.toolbarHeight)
												{
													AP.resize(Math.max(bodyW, settingDialog.offsetWidth + 35), 
														Math.max(bodyH, settingDialog.offsetHeight + GraphViewer.prototype.toolbarHeight + 35));
													pResized = {w: bodyW, h: bodyH};
												}
											}
										};
										
										var commentsWindow = null;
										
										//Comments are only shown in lightbox mode
										if (lightbox)
										{
									    	var editorUi = new HeadlessEditorUi();
									    	AC.loadPlugins(editorUi);
									    	
									    	//Plugins doesn't have callbacks, so we use this hack. TODO Improve this
									    	function waitForUser()
									    	{
									    		if (editorUi.getCurrentUser().email == null)
								    			{
									    			setTimeout(waitForUser, 100);
								    			}
									    		else if (openComments) //Open the comments window here when the user is ready
												{
													openCommentsFunc();
												}
									    	}
									    	
											if (!licenseValid)
										    {
												editorUi.getComments = function(success, error)
												{
													error({message: mxResources.get('licenseRequired')});
													AC.logInfo('ConfNoLicense::Comment', getUrlParam('xdm_e'));
												}
												
												editorUi.addComment = function(comment, success, error)
												{
													error();
												}
											}
											
											waitForUser();
										}
										
										var openCommentsFunc = function(e)
										{
											if (commentsWindow != null)
											{
												commentsWindow.window.setVisible(commentsWindow.window.isVisible()? false : true);
											}
											else
											{
												var busyIcon = null;
												//Show busy icon
												try
												{
													if (e && e.target)
													{
														busyIcon = document.createElement('img');
														busyIcon.src = '/images/spin.gif';
														e.target.parentNode.appendChild(busyIcon);
													}
												} catch(e){}
												
												var spaceKey, pageId, pageType, contentVer;
												
												editorUi.saveComments = function(comments, success, error)
												{
													AC.saveCustomContent(spaceKey, pageId, pageType, name, displayName, revision,
			            									contentId, contentVer,
			            									function(responseText) 
			            									{
			            										var content = JSON.parse(responseText);
			            										
			            										contentId = content.id;
			            										contentVer = content.version.number;
			            										
			            										success();
			            									}, error, comments, true);
												};
												
												function createCommentsWindow()
												{
													commentsWindow = new CommentsWindow(editorUi, document.body.offsetWidth - 380, 120, 300, 350);
													
													function darkModeChanged()
													{
														if (Editor.isDarkMode())
														{
															commentsWindow.window.div.classList.add('geDarkMode');
															commentsWindow.window.div.style.colorScheme = 'dark';
														}
														else
														{
															commentsWindow.window.div.classList.remove('geDarkMode');
															commentsWindow.window.div.style.colorScheme = 'light';
														}
													}

													// TODO: Remove listener
													window.matchMedia('(prefers-color-scheme: dark)')
														.addEventListener('change', darkModeChanged);
													darkModeChanged();
													
													commentsWindow.window.setVisible(true);
													//Lightbox Viewer has 999 zIndex
													commentsWindow.window.getElement().style.zIndex = 2000;
													
													if (busyIcon != null)
													{
														busyIcon.parentNode.removeChild(busyIcon);
														busyIcon = null;
													}
												};
												
												//New diagrams
												if (AC.curDiagId == null)
												{
													AC.curDiagId = false;
												}

												editorUi.initComments(contentId, function(spaceKey_p, pageId_p, pageType_p, contentVer_p)
												{
													spaceKey = spaceKey_p; pageId = pageId_p; pageType = pageType_p; contentVer = contentVer_p;
													createCommentsWindow();
												}, createCommentsWindow);
											}
										};
										
										function processLink(url)
										{
											if (cachedConfig.confConfig != null && cachedConfig.confConfig.linkAdjustments)
											{
												var linkAdjustments = cachedConfig.confConfig.linkAdjustments;

												if (!linkAdjustments.initialized)
												{
													try
													{
														for (var i = 0; i < linkAdjustments.length; i++)
														{
															linkAdjustments[i].re = new RegExp(linkAdjustments[i].re, linkAdjustments[i].m);
														}
								
														linkAdjustments.initialized = true;
													}
													catch (e)
													{
														console.log('linkAdjustments parsing error', e);
													}
												}
												
												try
												{
													if (linkAdjustments.initialized)
													{
														for (var i = 0; i < linkAdjustments.length; i++)
														{
															var linkAdjustment = linkAdjustments[i];
															url = url.replace(linkAdjustment.re, linkAdjustment.r);
														}
													}
												}
												catch (e)
												{
													console.log('linkAdjustments error', e);
												}
											}

											return url;
										}
										
										var graphGetAbsoluteUrl = Graph.prototype.getAbsoluteUrl;

										Graph.prototype.getAbsoluteUrl = function(url)
										{
											if (url != null)
											{
												url = processLink(url);
											}
											
											return graphGetAbsoluteUrl.apply(this, arguments);
										};

										var graphGetTooltipForCell = Graph.prototype.getTooltipForCell;

										Graph.prototype.getTooltipForCell = function(cell)
										{
											var url = null;

											try
											{
												if (mxUtils.isNode(cell.value))
												{
													url = cell.value.getAttribute('link');

													if (url != null)
													{
														cell.value.setAttribute('link', processLink(url));
													}
												}

												return graphGetTooltipForCell.apply(this, arguments);
											}
											finally
											{
												if (url != null)
												{
													cell.value.setAttribute('link', url);
												}
											}
										};

										if (cachedConfig.confConfig)
										{
											if (cachedConfig.confConfig.autoCropViewer)
											{
												GraphViewer.prototype.autoCrop = true;
											}

											if (cachedConfig.confConfig.defaultAdaptiveColors != null)
											{
												Graph.defaultAdaptiveColors = cachedConfig.confConfig.defaultAdaptiveColors;
											}
											else if (cachedConfig.confConfig.enableCssDarkMode == false)
											{
												// Backwards compatibility
												Graph.defaultAdaptiveColors = 'simple';
											}
										}
										
										if (lightbox)
										{
											var config = {highlight: '#3572b0', nav: true, lightbox: false};
											
											var lbBtns = [];

											if (spaceKey)
											{
												if ((service == 'GDrive' || service == 'OneDrive' || !linkedMode) && name == name.trim()) // Cannot direct edit diagrams with spaces in name [Since saving remove them!]
												{
													lbBtns.push({icon: Editor.editImage, tooltip: mxResources.get('edit'), fn: editFunc, isEditBtn: true});
												}
												
												lbBtns.push({icon: openPageImg, tooltip: mxResources.get('confGotoPage'), fn: openParentPageFunc});
											}
											
											//Comments is for conf diagrams only (including linked ones)
											if (!linkedMode || (!service && !diagramUrl && !GHRepository && !csvFileUrl))
											{
												lbBtns.push({icon: Editor.commentImage, tooltip: mxResources.get('comments'), fn: openCommentsFunc});
											}
											
											EditorUi.prototype.lightboxToolbarActions = lbBtns;
											
											if (links != 'auto')
											{
												config.target = links;
											}
											
											config.pageId = aspectPageId;
											config.layerIds = aspectLayerIds;
											config['dark-mode'] = darkMode;
											
											var viewer = new GraphViewer(null, null, config);
											curViewer = viewer;
											
											viewer.lightboxChrome = false;
											viewer.xml = xml;
			
											// Enables layers via flag to avoid toolbar
											viewer.layersEnabled = true;
											viewer.tagsEnabled = true;
											
											var ui = viewer.showLocalLightbox();
											checkUserCanEdit();
											// Destroy lightbox with ui instance
											var destroy = ui.destroy;
											ui.destroy = function()
											{
												AP.dialog.close();
												destroy.apply(this, arguments);
											};
											
											// Workaround for ignored header toolbar height for iframe
											ui.editor.graph.container.style.bottom = '51px';
										}
										else
										{
											// LATER Is clearing the body enough?
											//In case we want to load another diagram
											var oldContainer = document.getElementById("drawIODiagram");
											
											if (oldContainer != null)
											{
												oldContainer.parentNode.removeChild(oldContainer);
											}

											var errMsg = document.getElementById("drawioError");

											if (errMsg != null)
											{
												errMsg.parentNode.removeChild(errMsg);
											}
											// LATER: Fix horizontal alignment ignored with 100% width of iframe
											// LATER: Fix page scrolling on touch device if trigger event on diagram
											// LATER: Hide toolbar after second container click for iOS
											// LATER: Disable responsive resize while lightbox shows
											var container = document.createElement('div');
											container.id = "drawIODiagram";
											//There is an issue with AP.resize when custom content is shown. It works only once!
											if (customContent) {
												document.body.style.overflow = "auto";
											}

											var exceedPageWidth = cachedConfig.confConfig && cachedConfig.confConfig.viewerCanExceedPageWidth;

											container.style.cssText = (customContent? '' : 'position:absolute;') +
												(exceedPageWidth? '' : 'max-width:100%;') +
												'border:1px solid transparent;box-sizing: border-box;' + 
												(isTemplate? 'height:' + diagramHeight + 'px;' : '');
											document.body.appendChild(container);

											if (exceedPageWidth)
											{
												document.body.style.overflowX = 'auto';
												document.documentElement.style.overflowX = 'auto';
											}

											var doc = mxUtils.parseXml(xml);
											
											//FF has a bug that allows toolbar to appear in preview mode (page editor)
											if (isPreview && !isServiceDesk)
											{
												tbStyle = 'hidden';
											}

											var config = {highlight: '#3572b0', 'toolbar-position': tbStyle,
												nav: true, border: border, zoom: zoom};
											
											if (pCenter)
											{
												config['auto-fit'] = true;
												config['resize'] = false;
												config['forceCenter'] = true;
												container.style.width = '100%';
											}
											
											if (tbStyle == 'top')
											{
												var title = typeof altDisplayName === 'string'? altDisplayName : displayName;
												config.title = title;

												if (diagramName && title != diagramName)
												{
													config.titleTooltip = title + '\n' + mxResources.get('filename') + ': ' + diagramName;
												}
											}
	
											if (links != 'auto')
											{
												config.target = links;
											}
											
											if (!enableLightbox)
											{
												config.lightbox = false;
											}
											
											if (tbStyle != 'hidden')
											{
												config.toolbar = 'pages zoom layers tags';
												
												if (enableLightbox)
												{
													config.toolbar += ' lightbox';
												}
											}
											else if (!pCenter)
											{
												// Workaround for invalid width if no toolbar is present
												var updateContainerWidth = GraphViewer.prototype.updateContainerWidth;
												
												GraphViewer.prototype.updateContainerWidth = function(container, width)
												{
													width += 3;
													updateContainerWidth.apply(this, arguments);
												};

												config.resize = true;
											}
											
											var settingsImage = Editor.gearImage;
											var settingsBtn = {title: mxResources.get('viewerSettings'), enabled: true, image: settingsImage, handler: settingsFunc};
											var editableServices = (service != null && service.length > 0 && service != 'AttFile');
											
											if (((tbStyle != 'hidden' && !linkedMode && !isServiceDesk) || 
													editableServices) && name == name.trim()) // Cannot direct edit diagrams with spaces in name [Since saving remove them!]
											{
												config.toolbar = (cachedConfig.confConfig && cachedConfig.confConfig.inplaceEdits === false? '' : 'edit ') + 
														'settings ' + config.toolbar;
												var editImage = Editor.editImage;
												
												config['toolbar-buttons'] = 
												{
													'edit': {title: mxResources.get('edit'), enabled: true,
														image: editImage, handler: editFunc},
													'settings': settingsBtn
												};
											}
											else if (linkedMode && !service && !diagramUrl && !GHRepository && !csvFileUrl && tbStyle != 'hidden')
											{
												config.toolbar = 'gotoPage settings ' + config.toolbar;
												var gotoPageImg = Editor.thinOpenImage; 
												
												config['toolbar-buttons'] = 
												{
													'gotoPage': {title: mxResources.get('confGotoPage'), enabled: true,
														image: gotoPageImg, handler: function()
														{
															getDiagContainerUrl(id, name, function(url)
															{
																monitorPopup(window.open(url));
															});
														}},
													'settings': settingsBtn
												};
											}
											else if (tbStyle != 'hidden')
											{
												config.toolbar = 'settings ' + config.toolbar;												
												config['toolbar-buttons'] = 
												{
													'settings': settingsBtn
												};
											}
											
											config.pageId = aspectPageId;
											config.layerIds = aspectLayerIds;
											config['dark-mode'] = darkMode;

											var viewer;
											
											try
											{
												viewer = new GraphViewer(container, doc.documentElement, config);
											}
											catch(e)
											{
												//Log and show error
												showError(mxResources.get('readErr') + ': ' + mxResources.get('notADiagramFile'));
												AC.logError('Confluence Cloud Viewer: viewer error ' + e.message,
															null, 1240, null, e, null, true);
												return;
											}
											
											curViewer = viewer;
											checkUserCanEdit();
			
											// Handles resize of iframe after zoom
											var graphDoResizeContainer = viewer.graph.doResizeContainer;
											
											function updateHeight(height)
											{
												AP.resize('100%', Math.ceil(height) + tbHeight + 2);
											};
											
											viewer.graph.doResizeContainer = function(width, height)
											{
												graphDoResizeContainer.apply(this, arguments);
												updateHeight(height);
											};
			
											// Updates the size of the iframe in responsive cases
											viewer.updateContainerHeight = function(container, height)
											{
												updateHeight(height);
											};
											
											updateHeight(container.offsetHeight);
											
											var orignShowLightbox = viewer.showLightbox;
											
											viewer.showLightbox = function(openComments)
											{
												//Revert back to opening the lightbox in a new tab since we cannot open Confluence dialogs as there is no custom data
												if (isServiceDesk)
												{
													orignShowLightbox.call(this, false); //Open in new tab without edit option
													return;
												}
												
												//Create an aspect reflecting current view
												var curAspect = AC.getViewerAspect(viewer);
												
												if (curAspect == null)
												{
													EditorUi.logEvent('CONF_VIEWER_CURRENT_PAGE_NOT_FOUND: current page = ' + viewer.currentPage + ', diagrams length = ' + (viewer.diagrams? viewer.diagrams.length : 'null'));
												}
												
												AP.dialog.create(
								                {
								                    header: displayName,
							                		key: 'lightbox',
								                    size: 'fullscreen',
								                    customData: {id: id, name: name, revision: revision, aspect: curAspect, links: links, displayName: displayName, contentId: contentId, custContentId: contentId, openComments: openComments,
																linkedMode: linkedMode, service: service, sFileId: sFileId, templateUrl: templateUrl,
																odriveId: odriveId, diagramUrl: diagramUrl, csvFileUrl: csvFileUrl,
																GHOwner: GHOwner, GHRepository: GHRepository, GHBranch: GHBranch, GHIsPrivate: GHIsPrivate},
								                    chrome: true
								                });
											};
											
											//Handle Anchor links
											var origCustomLinkClicked = viewer.graph.customLinkClicked;
											
											viewer.graph.customLinkClicked = function(href, associatedCell)
											{
												if (href.substring(0, 19) == 'data:confluence/id,')
												{
													var id = href.substring(19);
													
													var newWin = window.open();
													
													if (id)
													{
														AC.getContentInfo(id, null, function(info)
														{
															newWin.location = baseUrl + info._links.webui;
														}, function()
														{
															newWin.document.writeln(mxResources.get('objectNotFound'));
														});
													}
													else
													{
														throw new Error('Empty ID');
													}
												}
												else if (href.substring(0, 23) == 'data:confluence/anchor,')
												{
													AC.gotoAnchor(href.substring(23));
													return true;
												}
												else
												{
													return origCustomLinkClicked.apply(this, arguments);
												}
											};
											
											function updateImage(pageId, comment)
											{
												//Update the image
												function doSaveImage(imageData)
												{
													if (imageData != null)
													{
														AC.saveDiagram(pageId || imgPageId || id, name + (aspectHash? '-' + aspectHash : '') + '.png', AC.b64toBlob(imageData, 'image/png'),
																AC.noop, AC.noop, false, 'image/png', comment? comment : 'draw.io aspect image' + (curAttVer != null? ' - ' + curAttVer : ''), false, false);
													}
												};
												
												function serverFallback()
												{
													var req = new mxXmlRequest(EXPORT_URL, 'format=png&base64=1' + 
															(hiRes || (hiRes == null && cachedConfig.confConfig && cachedConfig.confConfig.hiResPreview) ? '&scale=2' : '') +
															(aspectLayerIds != null && aspectLayerIds.length > 0? '&extras=' + encodeURIComponent(JSON.stringify({layerIds: aspectLayerIds})) : '') + 
															(aspectPageId != null? '&pageId=' + aspectPageId : '') + '&xml=' + encodeURIComponent(xml));
								
													req.send(function(req)
													{
														doSaveImage(req.getStatus() >= 200 && req.getStatus() <= 299? req.getText() : null);
													}, AC.noop);
												
												};
												
												if (viewer.editor.isExportToCanvas())
												{
													viewer.editor.exportToCanvas(function(canvas)
													{
														var data = canvas.toDataURL('image/png');
														doSaveImage(data.substring(data.lastIndexOf(',') + 1));
													}
													, null, null, null, serverFallback, null, null, 
													hiRes || (hiRes == null && cachedConfig.confConfig && cachedConfig.confConfig.hiResPreview) ? 2 : 1);
												}
												else
												{
													serverFallback();
												}
											};

											//Check embedded diagrams preview image is in sync in the background
											if (linkedMode && 
												!(cachedConfig.confConfig && cachedConfig.confConfig.disableEmbedAutoImgGen) &&
												!diagramUrl && !GHRepository && !csvFileUrl && !service)
											{
												function checkImgVer()
												{
													if (imgAttVer != null && curAttVer != null && curAttVer != imgAttVer)
													{
														updateImage();
													}
												}
												
												//The case of referring to a diagram in another page
												//Get image version from attachment comment
												AC.getAttachmentInfo(imgPageId, name + '-' + aspectHash + '.png', false, function(info)
												{
													try
						                    		{
						                    			imgAttVer = parseInt(info.version.message.split(' - ').pop());
						                    		}
						                    		catch(e) {} //ignore
						                    		
						                    		imgAttVer = imgAttVer || attVer;
						                    		checkImgVer();
												}, AC.noop);
												
												//Get version
												AC.getAttachmentInfo(id, name, false, function(info)
												{
													curAttVer = info.version.number;
						                    		checkImgVer();
												}, AC.noop);
											}
											
											if (retryParams.saveIt && macroVersion > 1)
											{
												updateImage(retryParams.pageId, mxResources.get('drawPrev'));
											}

											//If there are comments, show the comments icon
											function addCommentsIcon()
											{
												var commentsIcon = document.createElement('img');
												commentsIcon.style.cssText = 'position:absolute;bottom: 5px; right: 5px;opacity: 0.25; cursor: pointer';
												commentsIcon.setAttribute('title', mxResources.get('showComments'));
												commentsIcon.src = Editor.commentImage;
												commentsIcon.addEventListener('click', function() 
												{
													viewer.showLightbox(true);
												});
												container.appendChild(commentsIcon);
											};
											
											AC.hasUnresolvedComments(id, contentId, name, function(hasUnresolvedComments)
											{
												if (hasUnresolvedComments)
												{
													addCommentsIcon();
												}
											}, function(){}); //Nothing to do in case of an error
										}

										// Wait 2 sec for the viewer to be ready then check license
										setTimeout(function()
										{
											AP.request({
												url: '/rest/atlassian-connect/1/addons/com.mxgraph.confluence.plugins.diagramly',
												success: function(res)
												{
													res = JSON.parse(res);

													if (res && res.license && res.license.evaluation)
													{
														// Show evaluation warning
														var evalWarning = document.createElement('div');
														evalWarning.style.cssText = 'position: absolute; bottom: 5px; left: 5px; right: 5px;opacity: 0.5; text-align: center;';
														evalWarning.innerText = mxResources.get('confEvalWarn');
														container.appendChild(evalWarning);
													}
												}
											});
										}, 2000);
							 		}
								};
							
							function showExtDiagram(url)
							{
								AC.fetchForeignUrl(url, loadDiagramSuccess, function(req)
								{
									if (req && req.getStatus && req.getStatus() == 404)
									{
										showError(mxResources.get('fileNotFound') + '.\n' + AC.htmlEntities(url), true);
									}
									else
									{
										showError(mxResources.get('unknownError') + '.\n' + AC.htmlEntities(url), true);
									}
								}, function()
							    {
									showError(mxResources.get('confTimeout') + '.\n' + AC.htmlEntities(url), true);
							    });
							};
							
							function extServiceErrFn(err)
							{
								err = err || {};
								var errMsg;
								var srvName = service == 'GDrive'? 'Google Drive' : 'OneDrive';
								var link, linkLbl;
								
								if (err.message)
								{
									errMsg = err.message;
								}
								else if (err.status == 404)
								{
									errMsg = mxResources.get('errFileNotFoundOrNoPer', [name, srvName]);
									
									if (service == 'GDrive')
									{
										errMsg += ' \n' + mxResources.get('firstTimeGD') + ' ';
										link = 'https://drive.google.com/open?id=' + sFileId;
										linkLbl = mxResources.get('tryOpeningViaThisPage');
									}
								}
								else
								{
									errMsg = mxResources.get('confGetInfoFailed', [srvName]);
								}
								
								showError(errMsg, true, link, linkLbl);
							};
								
							if (templateUrl)
							{
								if (tempIsBuiltIn)
								{
									showExtDiagram('/' + templateUrl);
								}
								else
								{
									function getTemplate(tmpUrl)
									{
										AP.request(
										{
											url: tmpUrl,
											success: function(xml)
											{
												loadDiagramSuccess(xml);
											},
											error: function (err)
											{
												var m = templateUrl.match(AC.attachmentFullUrl);

												if (m != null && m[1] != id && id != curPageId)
												{
													templateUrl = '/download/attachments/' + id + m[2];
													getTemplate(templateUrl);
												}
												else if (err.status == 404)
												{
													showError(mxResources.get('diagNotFound'), true);
												}
												else if (err.status == 0)
												{
													showError(mxResources.get('confNoPermErr', [id]), true);
												}
												else
												{
													showError(mxResources.get('confError', ['HTTP ' + err.status]), true);
												}
											}
										});
									};

									getTemplate(templateUrl);
								}
							}
							else if (diagramUrl)
							{
								showExtDiagram(diagramUrl);				
							}
							else if (GHRepository)
							{
								if (GHIsPrivate)
								{
									GHAC.getFile(GHOwner, GHRepository, 
										GHBranch, diagramName, function(filename, fileContent)
										{
											loadDiagramSuccess(fileContent, filename);
										}, function(err)
										{
											showError(mxResources.get('diagNotFoundChckUrl'), true);
										});
								}
								else
								{
									showExtDiagram(AC.buildGitHubUrl(GHOwner, GHRepository, GHBranch, diagramName));
								}
							}
							else if (csvFileUrl)
							{
								AC.fetchForeignUrl(csvFileUrl, function(data)
								{
									AC.importCsv(data, function(csvModel, xml)
									{
										loadDiagramSuccess(xml);
									},
									function()
									{
										showError(mxResources.get('unsupportedFileChckUrl') + '.\n' + AC.htmlEntities(csvFileUrl), true);
									});
								}, function(req)
								{
									showError(mxResources.get('csvNotFoundChckUrl') + '.\n' + AC.htmlEntities(csvFileUrl), true);
								}, function()
							    {
									showError(mxResources.get('confTimeout') + '.\n' + AC.htmlEntities(csvFileUrl), true);
							    }, true); // Our proxy does't allow CSV files for now
							}
							else if (service == 'GDrive')
							{
								GAC.getFileInfo(sFileId, function(fileInfo)
								{
									if (timeoutThread == null)
									{
										timeoutThread = createTimeoutThread();
									}
									
									var isPng = fileInfo.mimeType == 'image/png';
									displayName = fileInfo.title;
									
	                    			GAC.doAuthRequestPlain(fileInfo['downloadUrl'], 'GET', null, function(req)
									{
	                    				loadDiagramSuccess(req.responseText, isPng);
									}, function()
									{
										showError(mxResources.get('confReadFileErr', [name, 'Google Drive']), true);
									}, null, isPng);
								}, extServiceErrFn, function()
								{
									window.clearTimeout(timeoutThread);
									timeoutThread = null;
								});
							}
							else if (service == 'OneDrive')
							{
								AC.getFileInfo(sFileId, odriveId, function(fileInfo)
								{
									if (timeoutThread == null)
									{
										timeoutThread = createTimeoutThread();
									}
									
									var isPng = fileInfo.file.mimeType == 'image/png';
									displayName = fileInfo.name;
									
	                    			var req = new XMLHttpRequest();
	            					req.open('GET', fileInfo['@microsoft.graph.downloadUrl']);
	            					
	            					req.onreadystatechange = function()
	            					{
	            						if (this.readyState == 4)
	            						{
	            							if (this.status >= 200 && this.status <= 299)
	            							{
	            								loadDiagramSuccess(req.responseText, isPng);
	            							}
	            							else
	            							{
												showError(mxResources.get('confReadFileErr', [name, 'OneDrive']), true);
	            							}
	            						}
	            					};
	            					
	            					if (isPng && req.overrideMimeType)
	            					{
	            						req.overrideMimeType('text/plain; charset=x-user-defined');
	            					}
	            					
	            					req.send();
								}, extServiceErrFn, function()
								{
									window.clearTimeout(timeoutThread);
									timeoutThread = null;
								});
							}
							else
							{
								AP.request(
								{
									url: '/download/attachments/' + id + '/' + encodeURIComponent(name) +
										((revision != null && revision.length > 0 && licenseValid && withVersion) ? '?version=' + revision : ''),
									success: function(resp)
									{
										if (retryParams.saveIt && macroVersion > 1)
										{
											AC.saveDiagram(retryParams.pageId, name, resp, AC.noop, AC.noop, false, 
												'application/vnd.jgraph.mxfile', mxResources.get('drawDiag'));
										}

										AC.getAttachmentInfo(id, name, true, function(info, attInfo)
										{
											attInfo.diagramDisplayName = displayName;
											attInfo.diagramName = name;
											attInfo.revision = revision;
											AC.setupConfPlaceholders(attInfo);
											loadDiagramSuccess(resp);
											AC.curDiagVer = info.version.number;
											AC.curDiagId = info.id;
										}, function()
										{
											loadDiagramSuccess(resp);
											AC.curDiagId = false;
										});
									},
									error: function (err)
									{
								 		window.clearTimeout(timeoutThread);
										
								 		if (err.status == 404 || (err.status == 403 && revision != null))
								 		{
											// Remove leading/trailing spaces which wasn't supported before
											if (name != name.trim())
											{
												showDiagram(id, backupId, name.trim(), revision, links, retryParams, displayName, contentId, spaceKey, openComments, aspect)
											}
								 			//Copied pages are reset to revision 1, in addition, copy&paste pages saves diagrams imported from another page
								 			//So, try revision 1 first
								 			else if (revision > 1)
								 			{
									 			showDiagram(id, backupId, name, null, links, {revision: revision}, displayName, contentId, null, null, aspect);
								 			}
								 			else if (backupId != null)
							 				{
									 			//Since attachment wasn't found in this page, it is better to save it to this page
									 			showDiagram(backupId, null, name, revision || retryParams.revision, links, {saveIt: true, pageId: id}, displayName, contentId, null, null, aspect);
							 				}
								 			else //All alternatives failed, so this diagram is not found
							 				{
												function notFoundErr()
												{
													document.body.style.backgroundImage = 'none';
													showError(mxResources.get('fileNotFoundOrDenied'), true);
												};

												// Check if it is a historical version
												AP.request(
												{
													url: '/api/v2/pages/' + curPageId,
													success: function(resp)
													{
														resp = JSON.parse(resp);

														if (resp.id != id)
														{
															showDiagram(resp.id, null, name, revision || retryParams.revision, links, null, displayName, contentId, null, null, aspect);
														}
														else
														{
															notFoundErr();
														}
													},
													error: notFoundErr
												});
							 				}
								 		}
								 		else if (err.status == 0)
							 			{
								 			document.body.style.backgroundImage = 'none';
								 			
								 			if (linkedMode) //When the embedded diagram refers to a page that current user has no permissions to view, and error status 0 is returned
								 			{
								 				showError(mxResources.get('confNoPermErr', [id]), true);
								 			}
								 			else // This can happen when a macro has a pageId (backupId) that the current user doesn't have access to it AND the diagram itself is deleted from this page (e.g, macro is copy/paste)
								 				 //	, so show a more meaningful error with a dot to differentiate
							 				{
								 				showError(mxResources.get('diagNotFound') + '.', true);
							 				}
							 			}
								 		else if (acceptResponse)
								 		{
											document.body.style.backgroundImage = 'none';
											showError(mxResources.get('confError', ['HTTP ' + err.status]), true);
								 		}
									}
								});
							}
						}
					}
					else
					{
						showError(mxResources.get('confError', ['Invalid descriptor']), true);
					}
				};
	
				//This custom content path currently is only search by type or page attachment list
                if (customContent)
                {
                    AP.request({
                        type: 'GET',
                        url: '/api/v2/custom-content/' + contentId + '?body-format=storage',
                        contentType: 'application/json;charset=UTF-8',
                        success: function (resp) 
                        {
							try
							{
								resp = JSON.parse(resp);
								
								var info = JSON.parse(decodeURIComponent(resp.body.storage.value));
								
								AP.dialog.create(
								{
									header: resp.title,
									key: 'lightbox',
									size: 'fullscreen',
									//custom content can load old versions which will be overridden by version check
									customData: {id: info.pageId, name: info.diagramName, revision: info.version, aspect: info.aspect, links: links, 
										displayName: resp.title, spaceId: resp.spaceId, retryParams: {dontCheckVer: true}, contentId: contentId, custContentId: contentId, inComment: info.inComment,
										linkedMode: info.includedDiagram, service: info.service, sFileId: info.sFileId,
										odriveId: info.odriveId, diagramUrl: info.diagramUrl, csvFileUrl: info.csvFileUrl,
										GHOwner: info.GHOwner, GHRepository: info.GHRepository, GHBranch: info.GHBranch, GHIsPrivate: info.GHIsPrivate,
										isSketch: info.isSketch
									},
									chrome: true
								});
								
								AP.events.once('dialog.close', function(flags)
								{
									if (flags && flags.noBack)
									{
										if (flags.openEditorId)
										{
											//setTimeout is needed such that the current dialog closes completely
											//without it, the on close event is not called!
											setTimeout(function()
											{
												AP.dialog.create(
												{
													key: 'customContentEditor',
													customData: {contentId: flags.openEditorId, custContentId: flags.openEditorId, isSketch: info.isSketch == 1},
													chrome: false,
													width: "100%",
													height: "100%",
												});
												
												AP.events.once('dialog.close', function(flags)
												{
													if (flags && flags.noBack)
													{
														if (!flags.noBackOnClose)
														{
															//Go back after user (closes/clicks the link in) the flag 
															AP.events.once('flag.close', function(){
																AP.history.go(-1);
															});
															AP.events.once('flag.action', function(){
																AP.history.go(-1);
															});
														}
													}
													else
													{
														AP.history.go(-1);
													}
												});
											}, 10);
										}
									}
									else
									{
										AP.history.go(-1);
									}
								});
							}
							catch (e)
							{
								console.log(e);
								AP.history.go(-1);
							}
                        },
                        error: function (resp) 
                        {
                        	AC.showNotification({
          					  title: mxResources.get('error'),
          					  body: mxResources.get('diagNotFound'),
          					  type: 'error'
          					});
          					
	                      	//give the user some time to read the error!
	                      	setTimeout(function()
	                  		{
	                      		AP.history.go(-1);	
	                      	}, 500);
                        }
                    });
                }
                else if (lightbox)
				{
					// Gets the paramters from the customData object in lightbox mode
					// LATER: Add XML to custom data (does not seem to work)
                	AP.dialog.getCustomData(function (customData) {
						if (customData == null)
						{
							AP.sizeToParent();
							showDiagram(ceoId, ceoId, diagramName);
						}
						else
						{
							inComment = customData.inComment;
							//Add support for embed macros //TODO Code needs organizing
							linkedMode = customData.linkedMode;
							service = customData.service;
							sFileId = customData.sFileId;
							odriveId = customData.odriveId;
							diagramUrl = customData.diagramUrl;
							csvFileUrl = customData.csvFileUrl;
							GHOwner = customData.GHOwner;
							GHRepository = customData.GHRepository;
							GHIsPrivate = customData.GHIsPrivate;
							GHBranch = customData.GHBranch;
							diagramName = customData.name;
							isSketch = customData.isSketch;
							templateUrl = customData.templateUrl;
							showDiagram(customData.id, customData.id, customData.name, customData.revision, 
									customData.links, customData.retryParams, customData.displayName, customData.contentId || customData.custContentId,
									customData.spaceId, customData.openComments, customData.aspect);
						}
					});
				}
				else
				{
					if (pageInfo)
					{
						AC.getPageIdFromPageInfo(pageInfo, function(pageId, spaceId_p)
						{
							spaceId = spaceId_p;
							showDiagram(pageId, pageId, diagramName, revision, links, null, displayName, contentId, null, null, aspect);
						}, AC.noop); // We can ignore the error here as the other showDiagram call will handle it
					}

					showDiagram(candidateId, (owningPageId != null && owningPageId.length > 0) ? owningPageId : ceoId, diagramName, revision, links, null, displayName, contentId, null, null, aspect);
				}
		    };
		};
	};
	
	// Prefetches asynchronous requests so that below code runs synchronous
	// Loading the correct bundle (one file) via the fallback system in mxResources. The stylesheet
	// is compiled into JS in the build process and is only needed for local development.
	var bundleLoaded = false;
	var fontsLoaded = false;
	var configLoaded = false;
	var darkMode = null;
	var validSize = document.documentElement.offsetWidth > 0;

	function mainBarrier()
	{
		if (validSize && bundleLoaded && fontsLoaded  && 
			(hasLocalStorage || configLoaded) && darkMode != null)
		{
			main();
		}
	};

	if (window.mxConfThemeObserver == null)
	{
		mxConfThemeObserver = function(f)
		{
			f(false);
		}
	}

	mxConfThemeObserver(function(darkMode_p)
	{
		darkMode = darkMode_p;
		mainBarrier();
	}, true);

	var localeReady = false, licenseReady = false, configReady = false, needsRefresh = false;
	
	function storeCachedConfig()
	{
		if (localeReady && licenseReady && configReady)
		{
			if (hasLocalStorage)
			{
				localStorage.setItem(cacheKey, JSON.stringify(cachedConfig));
				
				if (needsRefresh)
				{
					location.reload();
				}
			}
			else
			{
				Editor.configureFontCss(cachedConfig.confConfig.fontCss);
				licenseValid = cachedConfig.licenseValid;
				mxLanguage = cachedConfig.locale;
				mxResources.loadDefaultBundle = false;
				var bundle = mxResources.getDefaultBundle(RESOURCE_BASE, mxLanguage) ||
					mxResources.getSpecialBundle(RESOURCE_BASE, mxLanguage);
		
				mxUtils.getAll([bundle], function(xhr)
				{
					// Adds bundle text to resources
					mxResources.parse(xhr[0].getText());
					configLoaded = true;
					mainBarrier();
				});
			}
		}
	};
	
	// Workaround for collapsed panel is to delay main until size is not 0
	if (!validSize)
	{
		var listener = function()
		{
			if (document.documentElement.offsetWidth > 0)
			{
				window.removeEventListener('resize', listener);
				validSize = true;
				mainBarrier();
			}
		};
		
		window.addEventListener('resize', listener);
	}
	
	licenseValid = cachedConfig.licenseValid != null? cachedConfig.licenseValid : true;
										
	AC.checkConfLicense(getUrlParam('lic'), decodeURIComponent(getUrlParam('xdm_e')), function(licenseValid_p)
	{
		needsRefresh = needsRefresh || (cachedConfig.licenseValid != licenseValid_p);
		cachedConfig.licenseValid = licenseValid_p;
		licenseValid = licenseValid_p;
		licenseReady = true;
		storeCachedConfig();
	});

	function init()
	{
		if (typeof AP === 'undefined' || typeof AP.getLocation !== 'function' || typeof AP.request !== 'function' || typeof mxClient === 'undefined')
		{
			document.body.innerHTML = '<div style="margin:20px;color:red">The Confluence bridge failed to load, preventing access to the necessary resources. Please refresh the page to attempt to resolve the issue.</div>';
			return;
		}

		try
		{
			AP.user.getLocale(function(lang)
			{
				// Overrides browser language with Confluence user language
				if (lang != null)
				{
					var dash = lang.indexOf('_');
					
					if (dash >= 0)
					{
						var locale = lang.substring(0, dash);					
						needsRefresh = needsRefresh || (cachedConfig.locale != locale);
						cachedConfig.locale = locale;
					}
				}
				
				localeReady = true;
				storeCachedConfig();
			});
		}
		catch (e)
		{
			localeReady = true;
			storeCachedConfig();
		}
	
		if (mxResources.getDefaultBundle)
		{
			mxLanguage = cachedConfig.locale || 'en';
			mxResources.loadDefaultBundle = false;
			var bundle = mxResources.getDefaultBundle(RESOURCE_BASE, mxLanguage) ||
				mxResources.getSpecialBundle(RESOURCE_BASE, mxLanguage);

			mxUtils.getAll([bundle], function(xhr)
			{
				// Adds bundle text to resources
				mxResources.parse(xhr[0].getText());
				bundleLoaded = true;
				mainBarrier();
			});
		}
		else
		{
			bundleLoaded = true;
			mainBarrier();
		}

		// Workaround for Google Chrome triggering
		// no resize event if height is set to 0
		if (mxClient.IS_GC && !validSize)
		{
			AP.resize('100%', 1);
		}
		
		// Checks configuration and loads fontCss
		// While this is executed in parallel it still adds unnecessary
		// calls since it is only needed if global fontCss is used
		var skipUpdate = false;
		
		if (cachedConfig.confConfig != null)
		{
			try
			{
				var config = cachedConfig.confConfig;
				// Config is only updated every 5 minutes to avoid updating multiple times on same page
				skipUpdate = config.lastUpdate != null && config.lastUpdate + 300000 > new Date().getTime();
				Editor.configureFontCss(config.fontCss);
			}
			catch(e) {} //Ignore config error
		}
		else
		{
			cachedConfig.confConfig = {};
		}
		
		//Always call main barrier here even if config is not loaded or not up-to-date
       	fontsLoaded = true;
		mainBarrier();
		
		if (!skipUpdate)
		{
			window.setTimeout(function()
			{
				AP.request({
		            type: 'GET',
		            url: '/rest/api/content/search?cql=type%3Dpage%20and%20space%3DDRAWIOCONFIG%20and%20title%3DConfiguration', //type=page and space=DRAWIOCONFIG and title=Configuration. Search doesn't return 404 if not found
		            contentType: 'application/json;charset=UTF-8',
		            success: function (resp) 
		            {
		                resp = JSON.parse(resp);
						var confPage = null;
						
						//Search can return more than one page
						for (var i = 0; i < resp.results.length; i++)
						{
							if (resp.results[i].title == 'Configuration')
							{
								confPage = resp.results[i];
								break;
							}
						}
		                
		                if (confPage != null)
		               	{
		                	// Loads the configuration file
		            		AP.request({
		                        type: 'GET',
		            			url: '/download/attachments/' + confPage.id + '/configuration.json',
		                        contentType: 'application/json;charset=UTF-8',
		                        success: function (fileContent) 
		                        {
		                        	try
		                        	{
		                        		var config = (fileContent != null && fileContent != '') ?
		                        			JSON.parse(fileContent) : null;
			                        	
		                        		var temp = {lastUpdate: new Date().getTime()};
		                        		
		                        		// Extracts configuration for viewer
		                        		if (config != null)
		                        		{
		                        			temp.fontCss = config.fontCss;
											temp.viewerTimeout = config.viewerTimeout;
											temp.simpleViewer = config.simpleViewer;
											temp.linkAdjustments = config.linkAdjustments;
											temp.version = config.version;
											temp.hiResPreview = config.hiResPreview;
											temp.autoCropViewer = config.autoCropViewer;
											temp.viewerCanExceedPageWidth = config.viewerCanExceedPageWidth;
											temp.disableEmbedAutoImgGen = config.disableEmbedAutoImgGen;
											temp.defaultAdaptiveColors = config.defaultAdaptiveColors;
											temp.enableCssDarkMode = config.enableCssDarkMode;
											temp.disableVersioning = config.disableVersioning;
											temp.inplaceEdits = config.inplaceEdits;
		                        		}
		                        		
										//Refresh only if config version is changed (a new config is added)
										needsRefresh = needsRefresh || (cachedConfig.confConfig.version != temp.version);
										cachedConfig.confConfig = temp;
			                        	configReady = true;
										storeCachedConfig();
		                        	}
		                        	catch (e)
		                        	{
		                        		console.log('Configuration error', e);
			                        	configReady = true;
										storeCachedConfig();
		                        	}
		            			},
		            			error: function()
								{
		                        	configReady = true;
									storeCachedConfig();
								}
			            	});
						}
		                else
		                {
							if (cachedConfig.confConfig.fontCss)
							{
								needsRefresh = true;
							}

		                	cachedConfig.confConfig = {lastUpdate: new Date().getTime()};										
                        	configReady = true;
							storeCachedConfig();
		                }
					}, error: function()
					{
                    	configReady = true;
						storeCachedConfig();
					}});
			}, 3000);
		}
		else
		{
			configReady = true;
			storeCachedConfig();
		}
	};

	if (typeof AP === 'undefined')
	{
		var script = document.createElement('script');
		
		script.onerror = function()
		{
			if (typeof AC !== 'undefined')
			{
				var message = ' all.js error time: ' + (Date.now() - initStart);
				var img = new Image();
				img.src = 'https://log.draw.io/log?severity=INFO&msg=CONF-PERF-ERR3:' + encodeURIComponent(message) + ':url:' + encodeURIComponent(AC.getBaseUrl());
			}
			
			//Cannot report this via Metrics API as AP is not loaded
		};
		
		script.onload = init;
		script.src = 'https://connect-cdn.atl-paas.net/all.js';
		script.setAttribute('data-options', 'resize:false;margin:false');
		document.getElementsByTagName('head')[0].appendChild(script);
	}
	else
	{
		init();
	}
})();