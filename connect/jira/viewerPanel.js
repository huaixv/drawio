(function()
{
	if (window.mxConfThemeObserver == null)
	{
		mxConfThemeObserver = function(f)
		{
			f(false);
		}
	}
	// Logs uncaught errors
	EditorUi.enableLogging = true;
	// Enables dynamic loading of shapes and stencils (same domain)
	mxStencilRegistry.dynamicLoading = true;

	var head = document.getElementsByTagName("head")[0];
	// Prefetches asynchronous requests so that below code runs synchronous
	// Loading the correct bundle (one file) via the fallback system in mxResources. The stylesheet
	// is compiled into JS in the build process and is only needed for local development.
	function loadBundle()
	{
		mxResources.loadDefaultBundle = false;
		var bundle = mxResources.getDefaultBundle(RESOURCE_BASE, mxLanguage) ||
			mxResources.getSpecialBundle(RESOURCE_BASE, mxLanguage);

		mxUtils.getAll([bundle], function(xhr)
		{
			// Adds bundle text to resources
			mxResources.parse(xhr[0].getText());
			mxConfThemeObserver(main, true);
		},function()
		{
			//Fallback to English
			mxLanguage = 'en';
			loadBundle();
		});
	};

	function allJSinit()
	{
		//For some reason, user is undefined sometimes
		if (AP.user == null)
		{
			mxLanguage = 'en';
			loadBundle();
			return;
		}
		
		AP.user.getLocale(function(lang)
		{
			// Overrides browser language with Confluence user language
			if (lang != null)
			{
				var dash = lang.indexOf('_');
				
				if (dash >= 0)
				{
					lang = lang.substring(0, dash);
				}
				
				mxLanguage = lang;
			}
			
			loadBundle();
		});
	};
	
	if (typeof AP === 'undefined')
	{
	    var script = document.createElement('script');
	    script.onload = allJSinit;
	    script.src = 'https://connect-cdn.atl-paas.net/all.js';
	    script.setAttribute('data-options', 'resize:false;margin:false');
	    head.appendChild(script);
	}
	else
	{
	    allJSinit();
	}

	function main()
	{
		var root = document.getElementById('root');
		root.innerHTML = '';
		var glanceMode = getUrlParam('glance') == '1';
		
		//Create draw.io panel toolbar (currently, we only have "Add Diagram" button)
		var toolbar = document.createElement('div');
		toolbar.style.cssText = "width:100%;height:35px";
		var addDiagramBtn = document.createElement('button');
		addDiagramBtn.className = "aui-button aui-button-primary drawio-add-diagram";
		mxUtils.write(addDiagramBtn, mxResources.get('addDiagram', null, 'Add Diagram'));
		
		addDiagramBtn.addEventListener('click', function()
		{
			AP.dialog.create(
			{
			   key: 'drawioEditor',
			   width: '100%',
			   height: '100%',
			   chrome: false
			});
		});
		
		toolbar.appendChild(addDiagramBtn);

		var embedDiagramBtn = document.createElement('button');
		embedDiagramBtn.className = "aui-button aui-button-primary drawio-add-diagram";
		mxUtils.write(embedDiagramBtn, mxResources.get('embedDiagram', null, 'Embed Diagram'));
		
		embedDiagramBtn.addEventListener('click', function()
		{
			AP.dialog.create(
			{
			   key: 'embedDiagram',
			   size: 'fullscreen',
			   chrome: true
			});
		});
		
		toolbar.appendChild(embedDiagramBtn);
		root.appendChild(toolbar);
		
		var editImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABUAAAAVBAMAAABbObilAAAAD1BMVEUAAAAAAAAQEBBycnIgICBqwj3hAAAAAXRSTlMAQObYZgAAADlJREFUCNdjoBwoChrAmCyGggJwYWVBBSiTSVDICKFa0AEuLCiEJKyAX5gBSZgBSZgBKGwMBKQ7HAAWzQSfKKAyBgAAAABJRU5ErkJggg==';
		var removeImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABUAAAAVAQMAAACT2TfVAAAABlBMVEUAAAAAAAClZ7nPAAAAAXRSTlMAQObYZgAAABlJREFUCNdjQAF/GBj4/x8AYxBg/k80RgYApAUPr950a4AAAAAASUVORK5CYII=';
		var issueId = getUrlParam('issueId');
		var serverName = getBaseUrl();
		var timeout = 25000;
		var index1 = serverName.indexOf('//');
		var updateTiles, updateHeight;
		
		if (index1 > 0)
		{
			var index2 = serverName.indexOf('/', index1 + 2);
			
			if (index2 > index1)
			{
				serverName = serverName.substring(index1 + 2, index2);
			}
		}
		
		// Delayed invocation see below
		function init()
		{
			// Workaround to ignore scrollbars when applying fit to available width in all but FF
			if (!mxClient.IS_FF)
			{
				document.body.style.width = document.documentElement.offsetWidth + 'px';
			}
			
			AP.resize('100%', '200px');
			
			var embeddedDiagrams = null;
			var attDiagrams = null;
			var allAttachments = null;
			var diagInfoMap = {};
			
			AP.request({
	   	        url: "/rest/api/2/issue/" + issueId + "/properties/drawio-metadata",
	   	        type: "GET",
	   	        success: function(resp)
	   	        {
	   	        	resp = JSON.parse(resp);
	   	            var diagramsInfo = resp.value;
	   	         	embeddedDiagrams = [];
	   	         
		   	        if (diagramsInfo.embeddedDiagrams != null)
	   	        	{
		   	        	embeddedDiagrams = diagramsInfo.embeddedDiagrams;
	   	        	}
		   	        
		   	        if (diagramsInfo.other != null)
	   	        	{
		   	        	for (var i = 0; i < diagramsInfo.name.length; i++)
	   	        		{
		   	        		diagInfoMap[diagramsInfo.name[i]] = diagramsInfo.other[i];
	   	        		}
	   	        	}
		   	        
		   	     	checkDone();
	   	        },
	   	        error : function()
	   	        {
	   	        	embeddedDiagrams = [];
	   	        	checkDone();
	   	        }
	   	    });
			
			//keeping the block of AP.require to minimize the number of changes!
			{
				AP.request({
					url: '/rest/api/2/issue/' + issueId + '?fields=attachment',
					type: 'GET',
					success: function(resp) 
					{
						var respObj = JSON.parse(resp);
						attDiagrams = [];
						allAttachments = [];
						
						for (var i = 0; i < respObj.fields.attachment.length; i++)
						{
							var attachment = respObj.fields.attachment[i];
							allAttachments.push(attachment);
							
							if (attachment.mimeType == 'application/drawio' || attachment.mimeType == 'application/vnd.jgraph.opc')
							{
								attachment.createDate = new Date(attachment.created.replace("+0000", "+00:00")); //The replace is needed for IE11
								attDiagrams.push(attachment);	
							}
						}

						//sort diagrams by date
						attDiagrams.sort(function(a,b)
						{
							return b.createDate - a.createDate;
						});
						
						checkDone();
					},
					error: function() 
					{
						attDiagrams = [];
						allAttachments = [];
						checkDone();
					}
				});
				
				function checkDone()
				{
					if (embeddedDiagrams != null && attDiagrams != null)
					{
						var tbHeight = GraphViewer.prototype.toolbarHeight;
						var tiles = [];
						var count = 0;
						var tilesPerRow, tileWidth, tileWidthCss, tileHeightCss, lastWidth;
						
						function showError(container, errMsg, withDelBtn, delHandler)
						{
							container.style.cssText = '';
							container.className = '';
							container.style.textAlign = 'center';
							container.style.color = 'red';
							container.style.marginTop = tbHeight + 'px';
							var errImg = document.createElement('img');
							errImg.src = '/mxgraph/images/error.gif';
							errImg.setAttribute('border', '0');
							errImg.setAttribute('align', 'absmiddle');
							container.appendChild(errImg);
							var errSpan = document.createElement('span');
							errSpan.innerText = errMsg;
							container.appendChild(errSpan);

							if (withDelBtn)
							{
								var delBtn = document.createElement('button');
								delBtn.style.marginLeft = '10px';
								delBtn.style.marginRight = '10px';
								delBtn.innerText = mxResources.get('delete');
								delBtn.onclick = delHandler;
								container.appendChild(delBtn);
							}
						};
						
						function updateTileSize()
						{
							var dim = getDocDim();
							
							if (glanceMode)
							{
								tilesPerRow = 1; //one per row is good as size is predefined and we have all the area
								tileWidth = dim.w;
							}
							else 
							{
								tilesPerRow = Math.max(Math.round(dim.w / 250), 1);
								//floor and -1 to avoid IE issues of moving last tile to next row
								tileWidth = Math.floor(dim.w / tilesPerRow) - 1;
							}

							tileWidthCss = tileWidth + "px";
							tileHeightCss = (tileWidth + tbHeight) + "px";
						};
						
						updateTileSize();
						AP.resize('100%', tileWidth + tbHeight + 35);
						
						updateHeight = function ()
						{
							var dim = getDocDim();
							
							lastWidth = dim.w;
							var rows = Math.ceil(tiles.length / tilesPerRow);

							// +5 is needed to include margin, 35 is the panel toolbar height
							var h = rows == 0? 30 : rows * (tiles[0].tile.offsetHeight + 5) + 50;
							
							// Restricts the max sidebar panel height
							var maxH = screen.height * 1.5;
							
							//In right panel, no need to set max as the size is automatically controlled by Jira. This avoids double scrollbars
							if (!glanceMode) 
							{
								h = Math.min(maxH, h);
							}
							
							AP.resize('100%', h);
							
							// Workaround for iframe scrollbars
							document.body.style.height = h + 'px';
							document.body.style.overflowY = (!glanceMode && maxH == h)? "auto" : "hidden";
						};
						
						updateTiles = function() 
						{
							var dim = getDocDim();
							
							if (lastWidth != dim.w)
							{
								updateTileSize();
								
								for (var i = 0; i < tiles.length; i++)
								{
									tiles[i].title.style.width = tileWidthCss;

									tiles[i].container.style.width = tileWidthCss;
									tiles[i].container.style.height = tileWidthCss;
									
									tiles[i].tile.style.width = tileWidthCss;
									tiles[i].tile.style.height = tileHeightCss;
								}
								
								updateHeight();
								
								return true;
							}
							
							return false;
						};
						
						//TODO FIXME Jira resize is not stable now, the panel is not resized in issues viewer unless it is closed, then open 
						//In glance mode, resize handler cause many issues and it is not actually needed!
						if (!glanceMode)
						{
							window.addEventListener('resize', updateTiles);
						}

						function finish() 
						{
							count--;
							
			 				if (count == 0) 
			 				{
			 					document.body.style.backgroundImage = 'none';
			 					document.body.style.width = '';
								updateHeight();
			 				}
						};
	
						var updatedEmbeddedDiagrams = [], updateEmbeddedThread = null;
						
						function updateEmbedded()
						{
							AP.request({
					   	        url: "/rest/api/2/issue/" + issueId + "/properties/drawio-metadata",
					   	        type: "GET",
					   	        success: function(resp) 
					   	        {
									resp = JSON.parse(resp);
					   	            var diagramsInfo = resp.value;
						   	        
						   	        if (diagramsInfo.embeddedDiagrams != null)
					   	        	{
						   	        	var list = diagramsInfo.embeddedDiagrams;
						   	        	var found = false;
						   	        	
						   	        	for (var i = 0; i < list.length; i++)
					   	        		{
											for (var j = 0; j < updatedEmbeddedDiagrams.length; j++)
											{
												var up = updatedEmbeddedDiagrams[j];
												
												if (list[i].cacheAttId == up.oldCacheAttId)
						   	        			{
													list[i].cacheAttId = up.cacheAttId;
							   	        			found = true;
						   	        			}
											}
					   	        		}
						   	        	
						   	        	if (found)
						   	        	{
								   	     	AP.request({
								   	            url: "/rest/api/2/issue/" + issueId + "/properties/drawio-metadata",
								   	            type: "PUT",
								   	            data: JSON.stringify(diagramsInfo),
								   	            contentType: 'application/json;charset=UTF-8'
								   	        });
						   	        	}
					   	        	}
					   	        }
								//We'll ignore errors as its only side effect is delayed diagram rendering
					   	    });
						};
							
						function loadDiagram(value)
						{
							var isOpc = value.mimeType == 'application/vnd.jgraph.opc';
							var attId = null;
							count++;
							var tile = document.createElement('div');
							tile.style.cssText = 'width:' + tileWidthCss + ';height:' + tileHeightCss + ';display:inline-block;overflow: hidden;';							
							root.appendChild(tile);
							
							var container = document.createElement('div');
							container.style.cssText = 'position:relative;box-sizing:border-box;margin-bottom:2px;' +
								'width:' + tileWidthCss + ';height:' + tileWidthCss + ';border:1px solid transparent;overflow: hidden;'; 
							container.className = 'loading';
							
							//Find displayName
							value.displayName = value.filename || value.displayName || value.diagramName;
							
							// Adds filename and ID to side panel
							var title = document.createElement('div'), createDate = null;
							
							function setTitle()
							{
								title.innerText = '';
								
								if (value.createDate != null)
								{
									createDate = value.createDate.toLocaleString();
									mxUtils.write(title, value.filename + ' (' + createDate + ')');
									var displayName = value.author != null ? value.author.displayName : '';
									title.setAttribute('title', value.filename + ' (' + createDate + ') - ' + displayName +
											' [ID: ' + value.id + ']');
								}
								else
								{
									var t = value.displayName || value.diagramName;
									mxUtils.write(title, t);
									var modifiedDate = value.modifiedDate? ' (' + new Date(value.modifiedDate).toLocaleString() + ')' : '';
									title.setAttribute('title', t + modifiedDate + (value.createdBy? ' - ' + value.createdBy : '') +
											(value.lastModifiedBy? ' [Last Modified By: ' + value.lastModifiedBy + ']' : ''));
								}
							};
							
							setTitle();
							title.style.cssText = 'position:relative;box-sizing:border-box;width:' + tileWidthCss + ';padding: 6px 0 0 3px;height:' + tbHeight +
								'px;margin-bottom:-' + tbHeight + 'px;text-align:left;white-space:nowrap;cursor:pointer;overflow:hidden;';
							tile.appendChild(title);					
							tile.appendChild(container);
							tiles.push({tile: tile, container: container, title: title});
							var acceptResponse = true, timeoutThread;
							
							function setConTimeout()
							{
								timeoutThread = window.setTimeout(function()
								{
									acceptResponse = false;
									
									showError(container, 'The connection has timed out: The server at ' +
											serverName + ' is taking too long to respond.');
		 							finish();
								}, timeout);
							};
							
							function delHandler()
							{
								if (confirm(mxResources.get('removeIt', [value.displayName]) + '?'))
								{
									if (value.diagramUrl != null || value.service != null)
									{
										var doDelete = function(resp)
										{
											resp = JSON.parse(resp);
											var diagramsInfo = resp.value;
											
											if (diagramsInfo.embeddedDiagrams != null)
											{
												var list = diagramsInfo.embeddedDiagrams;
												var found = false;
												
												for (var i = 0; i < list.length; i++)
												{
													if ((value.diagramUrl != null && list[i].diagramUrl == value.diagramUrl) || 
															(value.delId == null && value.diagramName != null && 
																	list[i].diagramName == value.diagramName) ||
															(value.delId != null && list[i].delId == value.delId))
													{
														list.splice(i, 1);
														found = true;
														break;
													}
												}
												
												if (found)
												{
													if (diagramsInfo.id == null)
													{
														diagramsInfo.id = [];
													}
													
													//Glance counter properties
													AP.request({
														url: "/rest/api/2/issue/" + issueId + "/properties/com.atlassian.jira.issue:com.mxgraph.jira.plugins.drawio:drawioViewerGlance:status",
														type: "PUT",
														data: JSON.stringify({ type: 'badge', value: { label: String(diagramsInfo.id.length + diagramsInfo.embeddedDiagrams.length) } }),
														contentType: 'application/json;charset=UTF-8'
													});
							
													AP.request({
														url: "/rest/api/2/issue/" + issueId + "/properties/drawio-metadata",
														type: "PUT",
														data: JSON.stringify(diagramsInfo),
														contentType: 'application/json;charset=UTF-8',
														success: function()
														{
															AP.jira.refreshIssuePage();
														},
														error : function()
														{
															alert('Remove failed, please try again later.');
														}
													});
												}
												else
												{
													alert('Diagram not found.');
													
													AP.jira.refreshIssuePage();
												}
											}
											else
											{
												alert('Unexpected Error.');
											}
										};
											
										AP.request({
											url: "/rest/api/2/issue/" + issueId + "/properties/drawio-metadata",
											type: "GET",
											success: doDelete,
											error : function() 
											{
												alert('Unexpected Error, please try again later.')
											}
										});
										
										if (attId != null)
										{
											AP.request({
												url: '/rest/api/2/attachment/' + attId,
												type: 'DELETE',
												success: AC.noop,
												error: AC.noop
											});
										}
									}
									else
									{
										AP.request({
											url: '/rest/api/2/attachment/' + value.id,
											type: 'DELETE',
											success: function()
											{
												AP.request({
													url: "/rest/api/2/issue/" + issueId + "/properties/drawio-metadata",
													type: "GET",
													success: function(resp)
													{
														resp = JSON.parse(resp);
														var diagramsInfo = resp.value;
														
														if (diagramsInfo.id != null)
														{
															var list = diagramsInfo.id;
															var found = false;
															
															for (var i = 0; i < list.length; i++)
															{
																if (list[i] == value.id)
																{
																	list.splice(i, 1);
																	diagramsInfo.name.splice(i, 1);
																	diagramsInfo.txtContent.splice(i, 1);
																	diagramsInfo.updated.splice(i, 1);
																	if (diagramsInfo.other)
																	{
																		diagramsInfo.other.splice(i, 1);
																	}
																	found = true;
																	break;
																}
															}
															
															if (diagramsInfo.id.length == 0)
															{
																diagramsInfo.hasDiagram = 0;
															}
															
															if (found)
															{
																if (diagramsInfo.embeddedDiagrams == null)
																{
																	diagramsInfo.embeddedDiagrams = [];
																}

																//Glance counter properties
																AP.request({
																	url: "/rest/api/2/issue/" + issueId + "/properties/com.atlassian.jira.issue:com.mxgraph.jira.plugins.drawio:drawioViewerGlance:status",
																	type: "PUT",
																	data: JSON.stringify({ type: 'badge', value: { label: String(diagramsInfo.id.length + diagramsInfo.embeddedDiagrams.length) } }),
																	contentType: 'application/json;charset=UTF-8'
																});
										
																AP.request({
																	url: "/rest/api/2/issue/" + issueId + "/properties/drawio-metadata",
																	type: "PUT",
																	data: JSON.stringify(diagramsInfo),
																	contentType: 'application/json;charset=UTF-8',
																	success: function()
																	{
																		AP.jira.refreshIssuePage();
																	},
																	error : function()
																	{
																		AP.jira.refreshIssuePage();
																	}
																});
															}
															else
															{
																AP.jira.refreshIssuePage();
															}
														}
													},
													error : function() 
													{
														AP.jira.refreshIssuePage();
													}
												});
											},
											error : function(err)
											{
												if (err && err.status == 403)
												{
													alert(mxResources.get('errAccessFile', [value.displayName]));
												}
												else
												{
													alert(mxResources.get('errorDeletingFile'));	
												}
												
												AP.jira.refreshIssuePage();
											}
										});
									}
								}
							};
									
							function renderDiagram(xml)
							{
						 		window.clearTimeout(timeoutThread);
								
						 		if (acceptResponse)
						 		{
						 			var pageId, layerIds, diagInfo = diagInfoMap[value.filename] || {};
						 			
						 			var aspect = value.aspect || diagInfo.aspect;
									
									if (aspect != null)
									{
										var aspectArray = aspect.split(' ');
										
										if (aspectArray.length > 0)
										{
											pageId = aspectArray[0];
											layerIds = aspectArray.slice(1);
										}
									}
									
									container.innerText = '';
									
									var doc = typeof xml === 'string'? mxUtils.parseXml(xml) : xml;
		
									var btnDefs = {
										'edit': {title: mxResources.get('edit'), enabled: typeof window.Blob !== 'undefined',
											image: editImage, handler: function()
										{
											AP.dialog.create(
											{
											   key: 'drawioEditor',
											   width: '100%',
											   height: '100%',
											   chrome: false,
											   customData : {diagramName: value.filename || value.diagramName, diagramId: value.id, 
															 page: viewer.currentPage, diagInfo: diagInfoMap[value.filename],
															 isEmbed: value.service == 'AttFile', displayName: value.displayName,
															 isOpc: isOpc}
											});
											
											//TODO Edit for service based files??
										}},
										'remove': {title: mxResources.get('delete'), image: removeImage, handler: delHandler}
									};
									
									var viewer = new GraphViewer(container, doc.documentElement, {highlight: '#3572b0',
										'toolbar-position': 'top', toolbar: (value.diagramUrl != null || 
												(value.service != null && value.service != 'AttFile')? '' : 'edit ') +
										'pages layers tags lightbox remove', border: 8, 'auto-fit': true, resize: false,
										pageId: pageId, layerIds: layerIds, nav: true, 'toolbar-buttons': btnDefs,
										title: diagInfo.displayName || value.displayName});
									
									container.classList.remove('loading');
									// Handles resize of iframe after zoom
									var graphDoResizeContainer = viewer.graph.doResizeContainer;
									
									viewer.graph.doResizeContainer = function(width, height)
									{
										graphDoResizeContainer.apply(this, arguments);
										updateHeight();
									};
									
									// Updates the size of the iframe in responsive cases
									viewer.updateContainerHeight = function(container, height)
									{
										updateHeight();
									};
		
									viewer.showLightbox = function()
									{
										//Create an aspect reflecting current view
										var aspectInfo = {};
										AC.getViewerAspect(viewer, aspectInfo);
		
										AP.dialog.create(
										{
						                   header: value.displayName + (createDate? ' (' + createDate + ')' : ''),
										   key: 'drawioFullScreenViewer',
						                   size: 'fullscreen',
										   chrome: true,
										   customData: {
												diagramName: value.displayName,
												xml: viewer.xml,
												isOpc: isOpc,
												diagramId: value.id || attId,
												pageId: aspectInfo.pageId, layerIds: aspectInfo.layerIds
											} 
										});					
									};

									finish();
						 		}
							};
							
							// Loads attachment content
							if (value.diagramUrl != null)
							{
								 var xhr = new XMLHttpRequest();
						 		 xhr.open('GET', value.diagramUrl);
						 		
						 		 xhr.onreadystatechange = function()
						 		 {
						 			if (xhr.readyState == 4)
						 			{	
						 				if (xhr.status >= 200 && xhr.status <= 299)
										{
						 					renderDiagram(xhr.responseText);
										}
						 				else
					 					{
											showError(container, 'Error: Cannot fetch diagram "' + value.diagramName + '"', xhr.status == 404, delHandler);
											finish();
					 					}
						 			}
						 		 };
						 		
						 		 xhr.send();
							}
							else if (value.service != null && value.service != 'AttFile')
							{
								fetchAndRender(value);
							}
							else
							{
								loadAndRender(value.id || value.cacheAttId);
							}
							
							function loadAndRender(attId_)
							{
								value.id = attId = attId_;

								AP.request({
									url: '/rest/api/2/attachment/content/' + attId,
									success: function(resp)
									{
										if (isOpc)
										{
											function OnOpcErr() 
											{
												window.clearTimeout(timeoutThread);
										
												if (acceptResponse)
												{
													showError(container, 'Error: Invalid diagram format.');
													finish();
												}
											};

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
																renderDiagram(str);
															}
															else
															{
																OnOpcErr();
															}
														});
													}
													
												});

												if (!drawioFound)
												{
													OnOpcErr();
												}
											}, OnOpcErr); 
										}
										else
										{
											var isPng = value.mime == 'image/png';
											
											try 
											{
												if (isPng)
												{
													resp = AC.extractGraphModelFromPng(resp);
												}
												
												renderDiagram(resp);
											}
											catch(e)
											{
												getFileErr(e);
											}
										}
									},
									error: function(err) 
									{
								 		window.clearTimeout(timeoutThread);
										
								 		if (acceptResponse)
								 		{
											showError(container, 'Error: ' + err.status, err.status == 404, delHandler);
											finish();
								 		}
								    },
									binaryAttachment: isOpc
								});	
							};
							
							function getFileErr(err)
							{
								window.clearTimeout(timeoutThread);
								
						 		if (acceptResponse)
						 		{
									showError(container, 'Error: ' + ((err? err.message : '') || 'Unknown'), err && err.status == 404, delHandler);
									finish();
						 		}
							};
							
							function fetchAndRender(value)
							{
								var getFileInfoErr = function(err)
								{
									window.clearTimeout(timeoutThread);
										
							 		if (acceptResponse)
							 		{
										if (err && (err.status == 403 || err.status == 400)) //400 is returned when a business account file is accessed via a personal account
										{
											showError(container, 'Error: Access Denied. You do not have permission to access this file.');
										}
										else
										{
											showError(container, 'Error: ' + ((err? err.message : '') || 'Unknown'), err && err.status == 404, delHandler);
										}
										
										finish();
							 		}
								};
								
								if (value.service == 'GDrive')
								{
									GAC.getFileInfo(value.sFileId, function(fileInfo)
									{
										value.displayName = fileInfo.title;
										setTitle();
										
										GAC.getDrawioFileDoc(fileInfo, function(doc, cnt)
										{
											renderDiagram(doc);
										}, getFileErr);
									}, getFileInfoErr, null, container);
								}
								else if (value.service == 'OneDrive')
								{
									AC.getFileInfo(value.sFileId, value.odriveId, function(fileInfo)
									{
										value.displayName = fileInfo.name;
										setTitle();
										
										AC.getDrawioFileDoc(fileInfo, function(doc, cnt)
										{
											renderDiagram(doc);
										}, getFileErr);
									}, getFileInfoErr, null, container);
								}
								else if (value.service == 'Conf')
								{
									CC.confirmConfAuth(function()
									{
										CC.loadDiagram(value.pageId, value.attName, function(cnt)
										{
											renderDiagram(mxUtils.parseXml(cnt));
										}, getFileErr);
									}, getFileInfoErr, false, container);
								}
							};
						};
						
						var loadedDiagrams = {};

						for (var i = 0; i < attDiagrams.length; i++)
						{
							if (loadedDiagrams[attDiagrams[i].filename]) //Ignore duplicate diagrams (usually when edit fails to delete)
							{
								continue;
							}

							loadDiagram(attDiagrams[i]);
							loadedDiagrams[attDiagrams[i].filename] = true;
						}
						
						for (var i = 0; i < embeddedDiagrams.length; i++)
						{
							loadDiagram(embeddedDiagrams[i]);
						}
						
						// Shows message if no files are found
						if (count == 0)
						{
							mxUtils.write(root, mxResources.get('noFiles'));
							document.body.style.backgroundImage = 'none';
							AP.resize('100%', '200px');
						}
					}
				};
			};
		}; // end of init
		
		// Workaround for collapsed side panel is to delay init until size is not 0
		// NOTE: Since container.offsetWidth is 2 in this case the delayed rendering
		// in the viewer does not triggger. We disable is here to make sure this does
		// not change in case the container width is zero in the future.
		GraphViewer.prototype.checkVisibleState = false;
		
		if (document.documentElement.offsetWidth == 0)
		{
			var listener = function()
			{
				if (document.documentElement.offsetWidth > 0)
				{
					window.removeEventListener('resize', listener);
					init();
				}
			};
			
			window.addEventListener('resize', listener);
		}
		else
		{
			init();
		}
		
		// Most probably not needed, but keep it just in case
		if (glanceMode)
		{
			setTimeout(function() 
			{
				if (updateTiles && !updateTiles())
					updateHeight();
			}, 1000); //Size take about half a second to stabilize (finish the animation)
		};
	}
})();