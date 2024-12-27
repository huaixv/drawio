function includeDiagramMain(confPageId, draftPage, inTemplate, pageType, spaceKey, configObj, darkMode)
{
	var EXPORT_URL = 'https://convert.diagrams.net/node/export';
	var selectedDiagramInfo = null;
	var theMacroData = null;
	var custContentId = null;
	var custContentVer = null;
	var selectedElt = null;
	var activeTab = 'recent';
	var recentLoaded = false;
	var searchLoaded = false;
	var curViewer = null;
	var attEditor, odEditor = null, gdEditor = null;
	var gSelFileContent = null;
	var gAttVer = null;
	var async = false;
	var editMode = false;
	var gCsvFileContent = null;
	
	var opts =
	{
		lines: 12, // The number of lines to draw
		length: 8, // The length of each line
		width: 3, // The line thickness
		radius: 5, // The radius of the inner circle
		rotate: 0, // The rotation offset
		color: '#000', // #rgb or #rrggbb
		speed: 1, // Rounds per second
		trail: 60, // Afterglow percentage
		shadow: false, // Whether to render a shadow
		hwaccel: false, // Whether to use hardware acceleration
		className: 'spinner', // The CSS class to assign to the spinner
		zIndex: 2e9 // The z-index (defaults to 2000000000)
	};
	
	var spinner = new Spinner(opts);
	
	//Viewer settings
	var simpleViewer = AC.$('#simpleViewer');
	var lightbox = AC.$('#lightbox');
	var center = AC.$('#center');
	var hiRes = AC.$('#hiRes');
	var toolbar = AC.$('#toolbar');
	var links = AC.$('#links');
	var zoom = AC.$('#zoom');
	
	if (!AC.isWhiteboardApp)
	{
		if (configObj == null || !configObj.disableRemoteEmbedding)
		{
			AC.$('#gDriveTab').style.display = '';
			AC.$('#oneDriveTab').style.display = '';
			AC.$('#extUrlTab').style.display = '';
			AC.$('#csvTab').style.display = '';
			AC.$('#githubTab').style.display = '';
		}

		AC.$('#uploadTab').style.display = '';
	}

	var errTimeout = null;
	
	function showError(errMsg, nohide)
	{
		clearTimeout(errTimeout);
		var errorMsg = document.getElementById('errorMsg');
		errorMsg.innerHTML = AC.htmlEntities(errMsg);
		errorMsg.className = 'fade';
		
		if (!nohide)
		{
			errTimeout = setTimeout(function()
			{
				errorMsg.className = '';
			}, 6000);
		}
	};
	
	function onSelect()
	{
		if (activeTab == 'extUrl')
		{
			var hasErr = false;
			
			if (!diagramUrl.value)
			{
				diagramUrl.style.border = '1px solid red';
				hasErr = true;
			}
			
			if (!diagramName.value)
			{
				diagramName.style.border = '1px solid red';
				hasErr = true;
			}
			
			if (hasErr)
			{
				return;
			}
			
			theMacroData = {
				baseUrl: baseUrl,
				diagramName: diagramName.value,
				diagramDisplayName: diagramName.value,
				diagramUrl: diagramUrl.value,
				includedDiagram: 1
			};
			document.getElementById('currentTab').style.display = '';
			document.getElementById('currentTab').click();
		}
		else if (activeTab == 'github')
		{
			if (!validateGithub())
			{
				return;
			}

			theMacroData = {
				baseUrl: baseUrl,
				diagramName: githubFilename.value,
				diagramDisplayName: githubFilename.value,
				GHOwner: githubOwner.value,
				GHRepository: githubRepository.value,
				GHBranch: githubBranch.value,
				GHIsPrivate: githubIsPrivate.checked ? '1' : '0',
				includedDiagram: 1
			};
			document.getElementById('currentTab').style.display = '';
			document.getElementById('currentTab').click();
		}
		else if (activeTab == 'csvImp') 
		{
			var hasErr = false;
			
			if (!csvFileUrl.value)
			{
				csvFileUrl.style.border = '1px solid red';
				hasErr = true;
			}
			
			if (!csvDiagName.value)
			{
				csvDiagName.style.border = '1px solid red';
				hasErr = true;
			}
			
			if (hasErr)
			{
				return;
			}
			
			theMacroData = {
				baseUrl: baseUrl,
				diagramName: csvDiagName.value,
				diagramDisplayName: csvDiagName.value,
				csvFileUrl: csvFileUrl.value,
				includedDiagram: 1
			};
			document.getElementById('currentTab').style.display = '';
			document.getElementById('currentTab').click();
		}
		else if (activeTab == 'gDrive') 
		{
			gdEditor.doSubmit();
		}
		else if (activeTab == 'oneDrive') 
		{
			odEditor.doSubmit();
		}
		else if (activeTab == 'upload') 
		{
			attEditor.doSubmit();
		}
		else if (selectedDiagramInfo != null) 
		{
			var info = selectedDiagramInfo.info;
			theMacroData = {
				diagramName: info.name,
				diagramDisplayName: info.displayName,
				pageId: info.pageId,
				imgPageId: confPageId,
				custContentId: info.contentId || info.custContentId,
				baseUrl: baseUrl,
				includedDiagram: 1,
				isSketch: info.isSketch
			};
			document.getElementById('currentTab').style.display = '';
			document.getElementById('currentTab').click();
		}
		else
		{
			showError(mxResources.get('selectDiag2Insert'));
		}
	};
	
	function onSubmit()
	{
		if (!licenseValid)
		{
			showError(mxResources.get('licenseRequired'));
			AC.logInfo('ConfNoLicense::Embed', xdm_e);
			return;
		}

		if (activeTab == 'current')
		{
			if (theMacroData != null && curViewer != null)
			{
				spinner.spin(document.getElementById('current'));
				AP.dialog.getButton('submit').disable();
				var aspectHash =  null, aspectInfo = {};
				
				var aspect = AC.getViewerAspect(curViewer, aspectInfo);
				theMacroData.aspect = aspect;
					
				if (theMacroData.imgPageId)
				{
					aspectHash = AC.sha1(aspect);
					theMacroData.aspectHash = aspectHash;
				}
				
				var bounds = curViewer.graph.view.graphBounds;
				theMacroData.width = Math.round(bounds.width) || null;
				theMacroData.height = Math.round(bounds.height) || null;
				
				//Viewer settings
				if (theMacroData.imgPageId || theMacroData.isUpload)
				{
					theMacroData.simple = simpleViewer.checked? '1' : '0';
					theMacroData.hiResPreview = hiRes.checked? '1' : '0';
				}
				
				theMacroData.lbox = lightbox.checked? '1' : '0';
				theMacroData.pCenter = center.checked? '1' : '0';
				theMacroData.tbstyle = toolbar.value;
				theMacroData.links = links.value;
				theMacroData.zoom = parseInt(zoom.value) / 100 || 1;
			
				function saveMacro()
				{
					if (inTemplate)
					{
						theMacroData.isTemplate = true;
					}
					else
					{
						delete theMacroData.isTemplate;
					}
					
					AP.confluence.saveMacro(theMacroData);
					AP.confluence.closeMacroEditor();
				};
				
				function saveError()
				{
					spinner.stop();
					AP.dialog.getButton('submit').enable();
					showError(mxResources.get('confASaveFailedErr'))
				};
				
				function doSaveImage(imageData)
				{
					if (imageData == null)
					{
						saveError();
						return;
					}
					
					AC.saveDiagram(confPageId, theMacroData.diagramName + (aspectHash? '-' + aspectHash : '') + '.png', AC.b64toBlob(imageData, 'image/png'),
							saveMacro, saveError, false, 'image/png', theMacroData.isUpload? 'draw.io preview' : 
									'draw.io aspect image' + (gAttVer != null? ' - ' + gAttVer : ''), false, draftPage);
				};
				
				function serverFallback()
				{

					var acceptResponse = true;
					
					var timeoutThread = window.setTimeout(function()
					{
						acceptResponse = false;
						doSaveImage(null);
					}, 25000);
			    	
			    	var req = new mxXmlRequest(EXPORT_URL, 'format=png&base64=1' + (hiRes.checked? '&scale=2' : '') +
			    			 (aspectInfo.layerIds != null && aspectInfo.layerIds.length > 0? '&extras=' + encodeURIComponent(JSON.stringify({layerIds: aspectInfo.layerIds})) : '') + 
							 (aspectInfo.pageId != null? '&pageId=' + aspectInfo.pageId : '') + '&xml=' + encodeURIComponent(curViewer.xml));

					req.send(function(req)
					{
				    	window.clearTimeout(timeoutThread);
						
						if (acceptResponse)
						{
							doSaveImage(req.getStatus() >= 200 && req.getStatus() <= 299? req.getText() : null);
						}
					}, 
					function()
					{
				    	window.clearTimeout(timeoutThread);
						
						if (acceptResponse)
						{
							doSaveImage(null);
						}
					});
			    
				};
				
				//Add custom content to non-Conf Diagrams
				if (!inTemplate && (theMacroData.service != null || theMacroData.csvFileUrl != null || 
									theMacroData.diagramUrl != null || theMacroData.GHRepository != null))
				{
					AC.saveCustomContent(spaceKey, confPageId, pageType, theMacroData.diagramName, theMacroData.diagramDisplayName, null, 
									(editMode? custContentId : null), custContentVer,
									function(responseText) 
									{
										var content = JSON.parse(responseText);
										
										theMacroData.custContentId = content.id;
										theMacroData.contentVer = content.version? content.version.number : 1;

										saveMacro();
									}, saveError, [], false, theMacroData);
				}
				else if (theMacroData.isUpload)
				{
					//Confirm filename is unique for new files
					AC.getPageAttachments(confPageId, function(attachments) 
					{
						var fileExists = false;
						var lc = theMacroData.diagramName.toLowerCase();
						
						// Checks if any files will be overwritten
						for (var i = 0; i < attachments.length && !fileExists; i++)
						{
							var an = attachments[i].title.toLowerCase();

							if (an == lc)
							{
								fileExists = true;
							}
						}
						
						if (fileExists)
						{
							//Make filename unique
							theMacroData.diagramName = Date.now() + '-' + theMacroData.diagramName;
						}
						
						AC.saveDiagram(confPageId, theMacroData.diagramName, gSelFileContent, function()
						{
							AC.saveCustomContent(spaceKey, confPageId, pageType, theMacroData.diagramName, theMacroData.diagramDisplayName, null, null, null,
								function(responseText) 
								{
									var content = JSON.parse(responseText);
									
									theMacroData.custContentId = content.id;
									theMacroData.contentVer = content.version? content.version.number : 1;
									
									if (curViewer.editor.isExportToCanvas())
							    	{
										curViewer.editor.exportToCanvas(function(canvas)
								    	{
								    		var data = canvas.toDataURL('image/png');
								   	   		doSaveImage(data.substring(data.lastIndexOf(',') + 1));
								    	}
								    	, null, null, null, serverFallback, null, null, hiRes.checked? 2 : 1);
							    	}
							    	else
						    		{
							    		serverFallback();
						    		}
								}, saveError, [], false);
						}, saveError, false, 'application/vnd.jgraph.mxfile', 'draw.io diagram', false, draftPage);
					}, saveError);
				}
				else
				{
					//Save the aspect image for conf diagrams only
					if (inTemplate)
					{
						saveMacro();
					}
					else if (curViewer.editor.isExportToCanvas())
			    	{
						curViewer.editor.exportToCanvas(function(canvas)
				    	{
				    		var data = canvas.toDataURL('image/png');
				   	   		doSaveImage(data.substring(data.lastIndexOf(',') + 1));
				    	}
				    	, null, null, null, serverFallback, null, null, hiRes.checked? 2 : 1);
			    	}
			    	else
		    		{
			    		serverFallback();
		    		}
				}
			}
			else
			{
				showError(mxResources.get('errShowingDiag'));
			}
		}
		else
		{
			showError(mxResources.get('officeSelectDiag'));
		}
	};
	 
	function deselectDiagram()
	{
		selectedDiagramInfo = null;

		if (selectedElt != null)
		{
			selectedElt.style.backgroundColor = 'transparent';
			selectedElt.style.border = '1px solid #ddd';
		}
	};
	
	function fillDiagramsList(list, listDiv, top, emptyMsg)
	{
		listDiv.innerText = ''; 
		var div = document.createElement('div');
		div.style.border = '1px solid #d3d3d3';
		div.style.margin = '6px 0 0 -1px';
		div.style.padding = '6px';
		div.style.overflow = 'auto';
		div.style.position = 'absolute';
		div.style.bottom = '10px';
		div.style.right = '10px';
		div.style.left = '10px';
		div.style.top = top + 'px';
		
		var w = 140;
		var h = 140;
		
		function selectElement(elt, infoObj)
		{
			deselectDiagram();
			
			selectedElt = elt;
			selectedDiagramInfo = infoObj;
			
			selectedElt.style.backgroundColor = '#e6eff8';
			selectedElt.style.border = '2px solid #ccd9ea';
		};

		function addButton(url, imgUrl, tooltip, infoObj)
		{
			var elt = document.createElement('div');
			elt.className = 'diagram';
			elt.style.height = w + 'px';
			elt.style.width = h + 'px';
			elt.style.display = 'inline-flex';
			elt.style.justifyContent = 'center';
			elt.style.alignItems = 'center';
			
			if (darkMode)
			{
				elt.style.filter = 'invert(93%) hue-rotate(180deg)';
			}

			elt.setAttribute('title', tooltip);
			
			var img = document.createElement('img');
			img.setAttribute('src', imgUrl);
			img.setAttribute('alt', tooltip);
			img.style.maxWidth = w + 'px';
			img.style.maxHeight = h + 'px';
			
			var fallbackImgUrl = imgUrl.replace('.drawio.xml', '').replace('.drawio', '').replace('.xml', '');
			elt.appendChild(img);
			
			img.onerror = function()
			{
				if (this.src != fallbackImgUrl)
				{
					this.src = fallbackImgUrl;
				}
				else
				{
					this.src = Editor.errorImage;
					this.onerror = null;
				}
			}
			
			elt.addEventListener('click', function(evt)
			{
				selectElement(elt, infoObj);
			});
			
			elt.addEventListener('dblclick', function(evt)
			{
				selectedDiagramInfo = infoObj;
				onSelect();
			});
			
			div.appendChild(elt);
		}
		
		for (var i = 0; i < list.length; i++)
		{
			addButton(list[i].url, list[i].imgUrl, list[i].title, list[i]);
		}
		
		if (list.length == 0 && emptyMsg)
		{
			var msg = document.createElement('div');
			msg.style.width = '100%';
			msg.style.height = '100%';
			msg.style.textAlign = 'center';
			msg.innerHTML = AC.htmlEntities(emptyMsg);
			
			div.appendChild(msg);
		}
		
		listDiv.appendChild(div);
		return div;
	}
	
	function activateTab()
	{
		deselectDiagram();
		showError('', true);
		AP.dialog.getButton('selectBtn').show();
		AP.dialog.getButton('submit').hide();
		AP.dialog.getButton('editOwningPgBtn').hide();
		AP.dialog.getButton('submit').disable();
		
		switch (activeTab)
    	{
	    case 'recent':
	    	if (!recentLoaded)
			{
	    		recentLoaded = true;
		    	AC.getRecentDiagrams(null, function(retList)
				{
    				fillDiagramsList(retList, document.getElementById('recentList'), 5, mxResources.get('noRecentDiags'));
				}, function() 
				{
					showError(mxResources.get('fetchingRecentFailed'), true);
				});
    		}
	    	break;
	    case 'search':
	    	if (!searchLoaded)
			{
	    		searchLoaded = true;
		    	//fill the div with empty box
		    	fillDiagramsList([], document.getElementById('searchList'), 35, mxResources.get('useSrch2FindDiags'));
			}
	    	break;
	    case 'gDrive':
	    	if (gdEditor == null)
    		{
    			gdEditor = new GDriveEditor(function(selectedFile, width, height, autoSize, selFileContent)
    			{
    				gSelFileContent = selFileContent;
    				gAttVer = null;
    				editMode = false;
    				
    				theMacroData = {
    					diagramName: selectedFile.title,
    					diagramDisplayName: selectedFile.title,
    					baseUrl: baseUrl,
    					service: 'GDrive',
    					sFileId: selectedFile.id,
    					aspect: selectedFile.aspect,
    					includedDiagram: 1
    				};
    				
    				document.getElementById('currentTab').style.display = '';
    				document.getElementById('currentTab').click();
    			}, null, 'GD', true, true, null, null, darkMode);
			}
	    	else
    		{
	    		gdEditor.spinner.stop();
    		}
	    	break;
	    case 'oneDrive':
	    	if (odEditor == null)
    		{
    			odEditor = new OneDriveEditor(function(selectedFile, width, height, autoSize, selFileContent)
 				{
    				gSelFileContent = selFileContent;
    				gAttVer = null;
    				editMode = false;
    				
    				theMacroData = {
    					diagramName: selectedFile.name,
    					diagramDisplayName: selectedFile.name,
    					baseUrl: baseUrl,
    					service: 'OneDrive',
    					sFileId: selectedFile.id,
    					odriveId: selectedFile.parentReference.driveId,
    					aspect: selectedFile.aspect,
    					includedDiagram: 1
    				};
    				
    				document.getElementById('currentTab').style.display = '';
    				document.getElementById('currentTab').click();
 				}, null, 'OD', true, true, null, null, null, darkMode);
    		}
	    	else
    		{
	    		odEditor.spinner.stop();
    		}
	    	break;
	    case 'upload':
	    	attEditor.spinner.stop();
	    	break;
		case 'current':
			AP.dialog.getButton('selectBtn').hide();
			AP.dialog.getButton('submit').show();
			
			AC.$('#simpleViewerCont').style.display = theMacroData.imgPageId || theMacroData.isUpload? '' : 'none';
			AC.$('#hiResCont').style.display = theMacroData.imgPageId || theMacroData.isUpload? '' : 'none';

			var div = document.getElementById('curViewer');
			div.innerText = '';
			var container = document.createElement('div');
			// NOTE: Height must be specified with default value "auto" to force automatic fit in viewer
			container.style.cssText = 'position:absolute;width:100%;height:auto;bottom:0px;top:0px;border:1px solid transparent;';
			div.appendChild(container);
			spinner.spin(div);
			
			var pageId, layerIds;
			
			if (theMacroData.aspect != null)
			{
				var aspectArray = theMacroData.aspect.split(' ');
				
				if (aspectArray.length > 0)
				{
					pageId = aspectArray[0];
					layerIds = aspectArray.slice(1);
				}
			}
			
			function showFile(fileContent)
			{
				if (!async) 
				{
					var doc = mxUtils.parseXml(fileContent);
					
					curViewer = new GraphViewer(container, doc.documentElement,
							{highlight: '#3572b0', border: 8, 'auto-fit': true,
							resize: false, nav: true, lightbox: false,
							title: (theMacroData.diagramDisplayName || theMacroData.diagramName),
							'toolbar-nohide': true, 'toolbar-position': 'top',
							toolbar: 'pages layers tags', pageId: pageId,
							layerIds: layerIds, 'dark-mode': darkMode});
				
					spinner.stop();
					AP.dialog.getButton('submit').enable();
				}
			};
			
			if (theMacroData.diagramUrl)
			{
				if (gSelFileContent == null)
				{
					processDiagramUrl(div, function(fileContent)
					{
						showFile(fileContent);
					});
				}
				else
				{
					showFile(gSelFileContent);
				}
			}
			else if (theMacroData.GHRepository)
			{
				if (gSelFileContent == null)
				{
					processGithubDiagram(div, function(fileContent)
					{
						showFile(fileContent);
					});
				}
				else
				{
					showFile(gSelFileContent);
				}
			}
			else if (theMacroData.csvFileUrl)
			{
				if (gSelFileContent == null)
				{
					processCsvUrl(div, function(fileContent)
					{
						showFile(fileContent);
					});
				}
				else
				{
					showFile(gSelFileContent);
				}
			}
			else if ((theMacroData.service != null || theMacroData.isUpload) && gSelFileContent != null)
			{
				showFile(gSelFileContent);
			}
			else
			{
				if (editMode)
				{
					AP.dialog.getButton('editOwningPgBtn').show();
				}

				function loadErr()
				{
					showError(mxResources.get('cantReadChckPerms'), true);
				}

				function loadDiagram()
				{
					//Get version
					AC.getAttachmentInfo(theMacroData.pageId, theMacroData.diagramName, false, function(info)
					{
						gAttVer = info.version.number;
						
						AP.request({
							url: '/download/attachments/' + theMacroData.pageId + '/' + encodeURIComponent(theMacroData.diagramName),
							success: showFile,
							error : loadErr
						});
					}, function()
					{
						if (theMacroData.pageInfo)
						{
							AC.getPageIdFromPageInfo(theMacroData.pageInfo, function(pageId)
							{
								theMacroData.pageId = pageId;
								theMacroData.pageInfo = null;
								loadDiagram();
							}, loadErr);
						}
						else
						{
							loadErr();
						}
					});
				};

				loadDiagram();
			}
			break;
		default:
			gSelFileContent = null;
    	}
	}
	
	function openTab(evt) 
	{
		var tabName = this.getAttribute('data-tabContetn');
	    // Declare all variables
	    var i, tabcontent, tablinks;

	    // Get all elements with class='tabcontent' and hide them
	    tabcontent = document.getElementsByClassName('tabcontent');
	    for (i = 0; i < tabcontent.length; i++) {
	        tabcontent[i].style.display = 'none';
	    }

	    // Get all elements with class='tablinks' and remove the class 'active'
	    tablinks = document.getElementsByClassName('tablinks');
	    for (i = 0; i < tablinks.length; i++) {
	        tablinks[i].className = tablinks[i].className.replace(' active', '');
	    }

	    // Show the current tab, and add an 'active' class to the button that opened the tab
	    document.getElementById(tabName).style.display = 'block';
	    evt.currentTarget.className += ' active';
	    
	    activeTab = tabName;
	    activateTab();
	}
	
	function doSearch()
	{
		var searchList = document.getElementById('searchList');
		var searchStr = document.getElementById('searchStr').value;
		
		if (searchStr != null && searchStr.length > 0)
		{
			spinner.spin(searchList);

			AC.searchDiagrams(searchStr, null, function(retList)
			{
				spinner.stop();
				fillDiagramsList(retList, searchList, 35, mxResources.get('noDiagrams'));
			}, function() 
			{
				showError(mxResources.get('searchFailed'), true);
			});
		}
		else
		{
			showError(mxResources.get('plsTypeStr'));
		}
	};
	
	//=======Upload==========
	attEditor = new AttViewerEditor(function(selectedFile, selFileContent, editedFile, width, height, autoSize, isDrawio, aspect, onError)
	{
		//We only have add in Jira
		if (selectedFile != null)
		{
			gSelFileContent = selFileContent;
			gAttVer = null;
			editMode = false;
			//Upload creates a draw.io diagram macro which can later be edited as 
			theMacroData = {
				diagramName: selectedFile.name,
				diagramDisplayName: selectedFile.name,
				pageId: confPageId,
				isUpload: 1,
				revision: 1, // To support revisions when reverting to initial macro version
				baseUrl: baseUrl,
				aspect: aspect
			};
			
			document.getElementById('currentTab').style.display = '';
			document.getElementById('currentTab').click();
		}
	}, null, 'UD', true, true, null, darkMode);
	
	//Staring the editor
	//Setting events listeners
	document.getElementById('searchBtn').addEventListener('click', doSearch);
	document.getElementById('searchStr').addEventListener('keypress', function(e)
	{
		if (e.keyCode == 13) doSearch();
	});
	
	function renderDiagram(div, doc, title)
	{
		div.innerText = '';
		var container = document.createElement('div');
		// NOTE: Height must be specified with default value "auto" to force automatic fit in viewer
		container.style.cssText = 'position:absolute;width:auto;left:0px;right:0px;height:auto;bottom:0px;top:0px;border:1px solid transparent;';
		div.appendChild(container);

		new GraphViewer(container, doc,
			{highlight: '#3572b0', border: 8, 'auto-fit': true, 'dark-mode': darkMode,
			resize: false, nav: true, lightbox: false, title: title,
			'toolbar-nohide': true, 'toolbar-position': 'top', toolbar: 'pages layers',
		});
	};
	
	
	document.getElementById('showDiagBtn').addEventListener('click', showDiagFromUrl);
	
	document.getElementById('showDiagBtnGH').addEventListener('click', showDiagFromGithub);
	
	function resetBorder()
	{
		if (this.value)
		{
			this.style.border = '';
			showError('');
		}
		
		//Reset file content on url change
		if (this.id.indexOf('Url') > 0 || this.id.indexOf('GH') > 0)
		{
			gSelFileContent = null;
			csvModel = null;
		}
	};
	
	//TODO Optimize extUrl and Csv code as they are very similar. Also, showFile is similar (conf server code is better)
	var diagramUrl = document.getElementById('diagramUrl');
	var diagramName = document.getElementById('diagramName');
	
	diagramUrl.addEventListener('keypress', resetBorder);
	diagramName.addEventListener('keypress', resetBorder);
	diagramUrl.addEventListener('change', resetBorder);
	diagramName.addEventListener('change', resetBorder);
	
	var csvFileUrl = document.getElementById('csvFileUrl');
	var csvDiagName = document.getElementById('csvDiagName');
	
	csvFileUrl.addEventListener('keypress', resetBorder);
	csvDiagName.addEventListener('keypress', resetBorder);
	csvFileUrl.addEventListener('change', resetBorder);
	csvDiagName.addEventListener('change', resetBorder);
	
	var githubFilename = AC.$('#filenameGH');
	var githubOwner = AC.$('#ownerGH');
	var githubRepository = AC.$('#repositoryGH');
	var githubBranch = AC.$('#branchGH');
	var githubIsPrivate = AC.$('#isPrivateGH');
	
	githubFilename.addEventListener('keypress', resetBorder);
	githubOwner.addEventListener('keypress', resetBorder);
	githubRepository.addEventListener('keypress', resetBorder);
	githubBranch.addEventListener('keypress', resetBorder);
	githubFilename.addEventListener('change', resetBorder);
	githubOwner.addEventListener('change', resetBorder);
	githubRepository.addEventListener('change', resetBorder);
	githubBranch.addEventListener('change', resetBorder);
	
	function processDiagramUrl(div, callback)
	{
		showError('');
		spinner.spin(div);
		
		AC.fetchForeignUrl(diagramUrl.value, function (data)
		{
			try
			{
				gSelFileContent = data;
				
				if (callback)
				{
					callback(gSelFileContent);
				}
				else
				{
					renderDiagram(div, mxUtils.parseXml(gSelFileContent).documentElement, diagramName.value);
				}
			}
			catch(e)
			{
				showError(mxResources.get('unsupportedFileChckUrl'), true);
				div.innerText = '';
				spinner.stop();
			}
		}, function()
		{
			showError(mxResources.get('diagNotFoundChckUrl'), true);
			div.innerText = '';
			spinner.stop();
		});
	};
	
	function processGithubDiagram(div, callback)
	{
		showError('');
		spinner.spin(div);
		
		function renderFile(fileContent, filename)
		{
			try
			{
				gSelFileContent = fileContent;
				
				if (callback)
				{
					callback(gSelFileContent);
				}
				else
				{
					renderDiagram(div, mxUtils.parseXml(gSelFileContent).documentElement, filename || githubFilename.value);
				}
			}
			catch(e)
			{
				showError(mxResources.get('unsupportedFileChckUrl'), true);
				div.innerText = '';
				spinner.stop();
			}
		};

		function readFileError()
		{
			showError(mxResources.get('diagNotFoundChckUrl'), true);
			div.innerText = '';
			spinner.stop();
		};

		if (githubIsPrivate.checked)
		{
			GHAC.getFile(githubOwner.value, githubRepository.value, 
				githubBranch.value, githubFilename.value, function(filename, fileContent)
				{
					renderFile(fileContent, filename);
				}, readFileError);
		}
		else
		{
			//Build github url
			var url = AC.buildGitHubUrl(githubOwner.value, githubRepository.value, 
						githubBranch.value, githubFilename.value);
			
			mxUtils.get(url, function(req)
			{
				if (req.getStatus() >= 200 && req.getStatus() <= 299)
				{
					renderFile(req.getText());
				}
				else
				{
					readFileError();
				}
			});
		}
	};
	
	function showDiagFromUrl(e)
	{
		e.preventDefault();
		
		if (!diagramUrl.value)
		{
			diagramUrl.style.border = '1px solid red';
			return;
		}
		
		processDiagramUrl(document.getElementById('extUrlDiagram'));
	};
	
	function validateGithub()
	{
		var error = false;
		
		if (!githubFilename.value)
		{
			githubFilename.style.border = '1px solid red';
			error = true;
		}
		
		if (!githubOwner.value)
		{
			githubOwner.style.border = '1px solid red';
			error = true;
		}

		if (!githubRepository.value)
		{
			githubRepository.style.border = '1px solid red';
			error = true;
		}

		if (!githubBranch.value)
		{
			githubBranch.style.border = '1px solid red';
			error = true;
		}
		
		return !error;
	}
	
	function showDiagFromGithub(e)
	{
		e.preventDefault();

		if (!validateGithub())
		{
			return;
		}
		
		processGithubDiagram(AC.$('#githubDiagram'));
	};
	
	function processCsvUrl(div, callback)
	{
		showError('');
		spinner.spin(div);
		
		AC.fetchForeignUrl(csvFileUrl.value, function(data)
		{
			try
			{
				gCsvFileContent = data;
				
				AC.importCsv(gCsvFileContent, function(csvModel, xml)
				{
					gSelFileContent = xml;
					
					if (callback)
					{
						callback(gSelFileContent, gCsvFileContent);
					}
					else
					{
						renderDiagram(div, csvModel, csvDiagName.value);
					}
				},
				function()
				{
					showError(mxResources.get('unsupportedFileChckUrl'), true);
					div.innerText = '';
					spinner.stop();
				});
			}
			catch(e)
			{
				showError(mxResources.get('unsupportedFileChckUrl'), true);
				div.innerText = '';
				spinner.stop();
			}
		}, function()
		{
			showError(mxResources.get('csvNotFoundChckUrl'), true);
			div.innerText = '';
			spinner.stop();
		}, null, true); // Our proxy does't allow CSV files for now
	};
	
	document.getElementById('convertBtn').addEventListener('click', function(e)
	{
		e.preventDefault();
		
		if (!csvFileUrl.value)
		{
			csvFileUrl.style.border = '1px solid red';
			return;
		}

		processCsvUrl(document.getElementById('csvDiagram'));
	});

	var tabs = document.getElementsByClassName('tablinks');
	
	for (var i = 0; i < tabs.length; i++)
	{
		tabs[i].addEventListener('click', openTab);
	}

	AP.sizeToParent(true);
	
	AP.confluence.getMacroData(function (macroData) 
	{
		if (macroData != null && macroData.includedDiagram != null)
		{
			theMacroData = macroData;
			editMode = true;
			custContentId = macroData.custContentId;
			custContentVer = macroData.contentVer;
			
			//Viewer settings
			simpleViewer.checked = macroData.simple == '1';
			lightbox.checked = macroData.lbox != '0';
			center.checked = macroData.pCenter == '1';
			hiRes.checked = macroData.hiResPreview == '1'; //TODO apply it in image generation
			toolbar.value = macroData.tbstyle || 'top';
			links.value = macroData.links || 'auto';
			zoom.value = (macroData.zoom || 1) * 100;
			
			if (macroData.diagramUrl)
			{
				diagramUrl.value = macroData.diagramUrl;
				diagramName.value = macroData.diagramName;
			}
			if (macroData.GHRepository)
			{
				githubFilename.value = macroData.diagramName;
				githubOwner.value = macroData.GHOwner;
				githubRepository.value = macroData.GHRepository;
				githubBranch.value = macroData.GHBranch;
				githubIsPrivate.checked = macroData.GHIsPrivate == '1';
			}
			else if (macroData.csvFileUrl)
			{
				csvFileUrl.value = macroData.csvFileUrl;
				csvDiagName.value = macroData.diagramName;
			}

			function extractFileContents(resp, isPng)
			{
				if (isPng)
				{
					resp = 'data:image/png;base64,' + Editor.base64Encode (resp);
					resp = AC.extractGraphModelFromPng(resp);
				}
				
				gSelFileContent = resp;
				async = false;
				document.getElementById('currentTab').click();
			};
			
			async = true;
			gSelFileContent = ''; //To prevent fetching the cached file
			var showCurrent = true;
			
			//Update file
			if (macroData.service == 'GDrive')
			{
				GAC.getFileInfo(macroData.sFileId, function(fileInfo)
				{
					var isPng = fileInfo.mimeType == 'image/png';
					
        			GAC.doAuthRequestPlain(fileInfo['downloadUrl'], 'GET', null, function(req)
					{
        				extractFileContents(req.responseText, isPng);
					}, function()
					{
						showError(mxResources.get('confReadFileErr', [fileInfo.title, 'Google Drive']), true);
					}, null, isPng);
				}, function()
				{
					showError(mxResources.get('confGetInfoFailed', ['Google Drive']), true);
				});
			}
			else if (macroData.service == 'OneDrive')
			{
				AC.getFileInfo(macroData.sFileId, macroData.odriveId, function(fileInfo)
				{
					var isPng = fileInfo.file.mimeType == 'image/png';
					
        			var req = new XMLHttpRequest();
					req.open('GET', fileInfo['@microsoft.graph.downloadUrl']);
					
					req.onreadystatechange = function()
					{
						if (this.readyState == 4)
						{
							if (this.status >= 200 && this.status <= 299)
							{
								extractFileContents(req.responseText, isPng);
							}
							else
							{
								showError(mxResources.get('confReadFileErr', [fileInfo.name, 'OneDrive']), true);
							}
						}
					};
					
					if (isPng && req.overrideMimeType)
					{
						req.overrideMimeType('text/plain; charset=x-user-defined');
					}
					
					req.send();
				}, function()
				{
					showError(mxResources.get('confGetInfoFailed', ['OneDrive']), true);
				});
			}
			else if (macroData.service == 'AttFile') //This is for backward compatibility 
			{
				AP.request({
					url: '/download/attachments/' + theMacroData.pageId + '/' + encodeURIComponent(theMacroData.diagramName),
					success: function(resp)
					{
						extractFileContents(resp);
					},
					error : function()
					{
						showError(mxResources.get('cantReadUpload'), true);
					}
				});
			}
			else
			{
				async = false;
				gSelFileContent = null;
			}
			
			document.getElementById('currentTab').click();
		}
		else if (macroData.isUpload)
		{
			AP.dialog.create(
            {
        		key: 'customContentEditor',
        		//sending pageId and revision to verify custom content matches opened diagram
                customData: {
					directEdit: true, 
            		macroData: macroData,
					curPageId: confPageId,
                },
                chrome: false,
                width: "100%",
                height: "100%",
            });
			
			AP.events.once('dialog.close', function(flags)
    		{
	        	if (flags && flags.newMacroData)
	    		{
					var macroData = flags.newMacroData;
					macroData.isUpload = 1;
					AP.confluence.saveMacro(macroData);
				}
				
				AP.confluence.closeMacroEditor();        		
    		});
		}
		else
		{
			showCurrent = false;
			document.getElementById('recentTab').click();
		}
		
		document.getElementById('currentTab').style.display = showCurrent? '' : 'none';
	});
	
	var selectBtn = AP.dialog.createButton({
		  text: mxResources.get('select') + '...',
		  identifier: 'selectBtn'
	});
	selectBtn.bind(onSelect);
	
	var editOwningPgBtn = AP.dialog.createButton({
		text: mxResources.get('editOwningPg'),
		identifier: 'editOwningPgBtn'
	});
	
	editOwningPgBtn.hide();
	editOwningPgBtn.bind(function()
	{
		if (theMacroData != null)
		{
			AP.navigator.go('contentedit', {contentId: theMacroData.pageId});
		}
	});

	AP.dialog.disableCloseOnSubmit();
	AP.events.on('dialog.submit', onSubmit);
	AP.dialog.getButton('submit').hide();
	AP.dialog.getButton('submit').disable();
};

//Logs uncaught errors
window.onerror = function(message, url, linenumber, colno, err)
{
	message = 'Confluence Cloud Embed Editor: ' + ((message != null) ? message : '');
	
	AC.logError(message, url, linenumber, colno, err);
};

var xdm_e = AC.getSiteUrl();
var license = AC.getUrlParam('lic', false);
var baseUrl = AC.getBaseUrl(); //TODO FIXME search and recent depends on having baseUrl global 
var licenseValid = true;

AC.checkConfLicense(license, xdm_e, function(pLicenseValid)
{
	licenseValid = pLicenseValid;
});

// Adds event listeners
document.getElementById('gdAnchor').onclick = function()
{
	document.getElementById('filePickerGD').click();
};

document.getElementById('odAnchor').onclick = function()
{
	document.getElementById('filePickerOD').click();
};

document.getElementById('fileUploadAnchor').onclick = function()
{
	document.getElementById('fileuploadUD').click();
};

// Main
function init()
{
	var allDone = 0, configObj = null, darkMode;
	
	function startEditor()
	{
		allDone++;
		
		if (allDone == 3)
		{
			AP.navigator.getLocation(function (data)
		    {
		    	if (data != null && data.context != null)
		   		{
		    		var draftPage = (data.target == 'contentcreate');
					var inTemplate = data.context.contentType == 'template';
		    		var pageId = data.context.contentId;
		    		
		    		includeDiagramMain(pageId, draftPage, inTemplate, data.context.contentType, data.context.spaceKey, configObj, darkMode);
		   		}
		    	else
				{
		    		alert(mxResources.get('errCantGetIdType'));
				}
		    });
		}
	};
	
	//start the macro editro
	AC.getAndApplyTranslation(startEditor, true);
	
	AC.getConfig(function (config) 
    {
    	configObj = config; 
       	startEditor();
	}, startEditor);  //if there is an error loading the configuration, just load the editor normally. E.g., 404 when the space doesn't exist

	mxConfThemeObserver(function(darkMode_p)
	{
		darkMode = darkMode_p;
		startEditor();
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