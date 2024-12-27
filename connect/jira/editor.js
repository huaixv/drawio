(function()
{
	// Parses URL parameters
	function getUrlParam(param)
	{
		var result = (new RegExp(param + '=([^&]*)')).exec(window.location.search);
		
		if (result != null && result.length > 0)
		{
			return decodeURIComponent(result[1].replace(/\+/g, '%20'))
		}
		
		return null;
	};

	function getBaseUrl()
	{
		var baseUrl = getUrlParam('xdm_e', true) + getUrlParam('cp', true);
		return baseUrl;
	};

   	var AC = {};

	var head = document.getElementsByTagName("head")[0];
	var licenseValid = true;

	function checkLicense(callback) 
	{
		licenseValid = true;
		//Exclude dev domain
		if (location.host == 'test.draw.io')
		{
			callback(true);
			return;
		}

		var xdm_e = getUrlParam('xdm_e');
		var license = getUrlParam('lic');

		if (license != null && xdm_e != null && license == 'none')
		{
			var hostParse = document.createElement('a');
			hostParse.href = xdm_e;
			var hostname = hostParse.hostname;
			
			if (hostname != null)
			{
				var xhr = new XMLHttpRequest();
			
				xhr.onreadystatechange = function()
				{
					if (xhr.readyState == XMLHttpRequest.DONE)
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
			
				xhr.open('POST', '/license?domain=' + hostname + '&jiraLicense=' + license, true);
				xhr.send(null);
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

	checkLicense(function(licenseValid)
	{
		if (!licenseValid)
		{
			alert('This feature requires draw.io to be licensed.');
			AP.dialog.close();
		}
	});

	// Gets current domain and protocol
	var link2 = document.createElement('a');
	link2.href = location.href;
	link2.href = link2.href; //to have 'host' populated under IE
	var editorHost = link2.protocol + '//' + link2.hostname;
//	var editorUrl = editorHost + '/?dev=1&test=1&embed=1&p=acj&modified=unsavedChanges&keepmodified=1&spin=1&ui=kennedy&atlas=1&browser=0&proto=json&libraries=1&notif=jira';
	var editorUrl = editorHost + '/?embed=1&p=acj&modified=unsavedChanges&keepmodified=1&spin=1&ui=kennedy&atlas=1&browser=0&proto=json&libraries=1&notif=jira';
	
	// Injects iframe into page
	var iframe = document.createElement('iframe');
	iframe.setAttribute('frameborder', '0');

	var initReceived = false;
	var startCalled = false;
	var xmlReceived = null;
	var filename = null;
	var diagInfo = null;
	var timeout = 25000;
	
	function startEditor()
	{
		// InitReceived is usually last (iframe loads slower than data)
		if (initReceived && xmlReceived != null && !startCalled)
		{
			startCalled = true;
			
			// Shows template dialog if diagram is empty
			if (xmlReceived == '')
			{
				iframe.contentWindow.postMessage(JSON.stringify({action: 'template'}));
			}
			else
			{
				iframe.contentWindow.postMessage(JSON.stringify({action: 'load',
					xml: xmlReceived, title: filename, diagInfo: diagInfo}));
			}
		}
	};
	
	window.addEventListener('message', function(evt)
	{
		if (evt.origin == editorHost)
		{
			var msg = JSON.parse(evt.data);
			
			if (msg.event == 'init')
			{
				document.body.style.backgroundImage = 'none';
				initReceived = true;
				startEditor();
			}
		}
	});
	
	function init()
	{
		var locale, customData, darkMode;

		AP.user.getLocale(function(lang)
		{
			mxLanguage = 'en';
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
			
			locale = true;
			doMain();
		});
		
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
			doMain();
		}, true);
		
		var issueId = getUrlParam('issueId');

		AP.resize('100%', '100%');
		
		//keeping the block of AP.require to minimize the number of changes!
		function doMain() 
		{
			if (customData == null || darkMode == null || locale == null) return;

			iframe.setAttribute('src', editorUrl + '&lang=' + window.mxLanguage + (darkMode? '&dark=1' : ''));
			document.body.appendChild(iframe);

			var serverName = getBaseUrl();
			var index1 = serverName.indexOf('//');
			
			if (index1 > 0)
			{
				var index2 = serverName.indexOf('/', index1 + 2);
				
				if (index2 > index1)
				{
					serverName = serverName.substring(index1 + 2, index2);
				}
			}
			
			// LATER: Add fallback diagramName lookup via attachment list if name is unique
			var diagramId = (customData != null) ? customData.diagramId : null;
			var diagramName = (customData != null) ? customData.diagramName : null;
			var isEmbed = (customData != null) ? customData.isEmbed : false;
			var displayName = (customData != null) ? customData.displayName : null;
			var isOpc = (customData != null) ? customData.isOpc : false;
			diagInfo = (customData != null) ? customData.diagInfo : {};
			
			if (!issueId && customData != null)
			{
				issueId = customData.issueId;
			}
			
		    function error(err, modified)
		   	{
		    	iframe.contentWindow.postMessage(JSON.stringify({action: 'spinner', show: false}));
            	var obj = null;
				
				if (err && err.responseText)
            	{
					try
					{
						obj = JSON.parse(err.responseText);
					}
					catch (e) {} // ignore
				}

				iframe.contentWindow.postMessage(JSON.stringify({action: 'dialog',
            		titleKey: 'error', message: obj && obj.errorMessages? obj.errorMessages[0] : ("Unknown Error " + (err? err.status : '')),
            		modified: modified, buttonKey: 'close'}));
		   	};
		   	
		   	function done(newDiagramId)
		   	{
				if (isEmbed)
				{
					saveContentSearchBody(issueId, diagramName, newDiagramId, null,
			                		closeDialog, closeDialog);    //ignore error and just exit
				}
				else
				{
		   			iframe.contentWindow.postMessage(JSON.stringify({action: 'textContent', diagramId: newDiagramId}));
				}
		   	};
		   	
		   	function saveDiagram(xml, insert)
		   	{
		   		try
		   		{
					var blob = new Blob([xml], {type: isEmbed? 'application/vnd.jgraph.mxfile.cached' : 'application/drawio'});
				    blob.name = diagramName;

		   			iframe.contentWindow.postMessage(JSON.stringify({action: 'spinner',
							messageKey: (insert) ? 'inserting' : 'saving'}));

				    // LATER: Update existing attachment if rest call available
			        AP.request(
			        {
			            url: '/rest/api/2/issue/' + issueId + '/attachments',
			            type: 'POST',
						//data: formData,
			            data: {file: blob},
			            contentType: 'multipart/form-data',
			            headers: {'X-Atlassian-Token': 'no-check'},
			            success: function(resp)
			            {
			            	resp = JSON.parse(resp);
			            	var newId = resp[0].id;
			            	if (insert)
			            	{
			            		done(newId);
			            	}
			            	else
			            	{
			            		// Deletes previous diagram
				    	        AP.request({
				    	            url: '/rest/api/2/attachment/' + diagramId,
				    	            type: 'DELETE',
				    	            success: function () 
				    	            {
				    	            	done(newId);
				    	            },
				    	            error: function(err)
				    	            {
				    	            	// Error deleting last version means concurrent save
				    	            	// in which case a copy of the attachment is created
				    	            	// or server-side flow was used, in which case a
				    	            	// manual delete of the attachment is required.
				    	            	done(newId);
				    	            }
				    	        });
			            	}
			            },
			            error: function(err)
	    	            {
	    	            	error(err, true);
	    	            }
			        });
		   		}
		   		catch (e)
		   		{
		   			error({responseText: JSON.stringify({errorMessages: [e.message]})}, true);
		   		}
		   	};
		   	
            var closeDialog = function()
            {
                AP.jira.refreshIssuePage();
                AP.dialog.close();
            };

		   	var saveContentSearchBody = function(issueId, diagramName, diagramId, textContent, success, error) 
		   	{
		   		var emptyInfo = {name: [], txtContent: [], updated: [], id: [], other: []};
		   	    var diagramsInfo = emptyInfo; 
		   	    
		   	    if (diagInfo == null)
	   	    	{
		   	    	diagInfo = {};
	   	    	}
		   	    
		   	    diagInfo.aspect = AC.aspect;
		   	    
		   	    var updateInfo = function(resp)
		   	    {
		   	        if (!resp.status) //no error
		   	        {
		   	        	resp = JSON.parse(resp);
		   	            diagramsInfo = resp.value;
		   	            
		   	            if (diagramsInfo.other == null)
	   	            	{
		   	            	diagramsInfo.other = [];
	   	            	}
		   	        }
		   	        
	   	        	var updated = false;

					if (isEmbed)
					{
						for (var i = 0; i < diagramsInfo.embeddedDiagrams.length; i++)
		   	        	{
							var d = diagramsInfo.embeddedDiagrams[i];
							
		   	        		if (diagramName == d.diagramName)
	   	        			{
				   	        	d.id = diagramId;
								d.cacheAttId = diagramId;
	   	        				break;
	   	        			}
		   	        	}
					}
					else
					{
			   	        try 
			   	        {
				   	        for (var i = 0; i < diagramsInfo.name.length; i++)
			   	        	{
			   	        		if (diagramName == diagramsInfo.name[i])
		   	        			{
					   	        	diagramsInfo.txtContent[i] = textContent;
					   	        	diagramsInfo.updated[i] = new Date();
					   	        	diagramsInfo.id[i] = diagramId;
					   	        	diagramsInfo.other[i] = diagInfo;
					   	        	updated = true;
		   	        				break;
		   	        			}
			   	        	}
			   	        } 
			   	        catch(e) 
			   	        {
			   	        	//Error in the format, so reset
			   	        	diagramsInfo = emptyInfo;
			   	        }
	
			   	     	if (!updated)
		   	        	{
			   	        	diagramsInfo.name.push(diagramName);
			   	        	diagramsInfo.txtContent.push(textContent);
			   	        	diagramsInfo.updated.push(new Date());
			   	        	diagramsInfo.id.push(diagramId);
			   	        	diagramsInfo.other.push(diagInfo);
		   	        	}
					}

		   	     	diagramsInfo.hasDiagram = 1;
		   	     	
		   	     	//Glance counter properties
		   	     	AP.request({
		   	            url: "/rest/api/2/issue/" + issueId + "/properties/com.atlassian.jira.issue:com.mxgraph.jira.plugins.drawio:drawioViewerGlance:status",
		   	            type: "PUT",
		   	            data: JSON.stringify({ type: 'badge', value: { label: String(diagramsInfo.id.length + 
		   	            		(diagramsInfo.embeddedDiagrams != null? diagramsInfo.embeddedDiagrams.length : 0)) } }),
						contentType: 'application/json;charset=UTF-8'
		   	        });

		   	     	AP.request({
		   	            url: "/rest/api/2/issue/" + issueId + "/properties/drawio-metadata",
		   	            type: "PUT",
		   	            data: JSON.stringify(diagramsInfo),
		   	            contentType: 'application/json;charset=UTF-8',
		   	            success: success,
		   	            error : error
		   	        });
		   	    };
		   	    
		   	    AP.request({
		   	        url: "/rest/api/2/issue/" + issueId + "/properties/drawio-metadata",
		   	        type: "GET",
		   	        success: updateInfo,
		   	        error : updateInfo
		   	    });
		   	};

			function sendRemoteInvReady()
			{
				iframe.contentWindow.postMessage(JSON.stringify({action: 'remoteInvokeReady'}));
				AC.remoteWin = iframe.contentWindow;
			};
			
			AC.setAspect = function(aspect, success, error)
			{
				AC.aspect = aspect;
			};

			//White-listed functions and some info about it
			AC.remoteInvokableFns = {
				setAspect: {isAsync: false}
			};

		   	//TODO This should be abstracted and handled in one place (currently it is copied from Conf Cloud)
		   	function handleRemoteInvoke(msg)
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
		   						sendResponse(null, err || 'Unknown Error');
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
		   				sendResponse(null, 'Invalid Call. Function Not Found: ' + funtionName);
		   			}
		   		}
		   		catch(e)
		   		{
		   			sendResponse(null, 'Invalid Call. Error Occured: ' + e.message);
		   		}
		   	};
		   	
		   	// Creates a new diagram
		   	if (diagramName == null)
		   	{
		   		xmlReceived = '';
		   		startEditor();
		   		filename = null;
		   		
				function promptName(name, err, errKey)
				{
					iframe.contentWindow.postMessage(JSON.stringify({action: 'prompt',
						titleKey: 'filename', okKey: 'save', defaultValue: name || '' }));
					
					if (err != null || errKey != null)
					{
						iframe.contentWindow.postMessage(JSON.stringify({action: 'dialog',
							titleKey: 'error', message: err, messageKey: errKey,
							buttonKey: 'ok'}));
					}
				};
				
				function checkName(name, fn, err)
				{
					if (name == null || name.length < 3)
					{
						err(name, 'Filename too short');
					}
					else if (/[&\*+=\\;/{}|\":<>\?~]/g.test(name))
					{
						err(name, 'Invalid characters \\ / | : { } < > & + ? = ; * " ~');
					}
					else
					{
						AP.request({
							url: '/rest/api/2/issue/' + issueId + '?fields=attachment',
							type: 'GET',
							success: function(resp) 
							{
								var respObj = JSON.parse(resp);
								
								for (var i = 0; i < respObj.fields.attachment.length; i++)
								{
									var attachment = respObj.fields.attachment[i];
									
									if (attachment.filename == name)
									{
										err(name, null, 'fileExists');
										
										return;
									}
								}
								
								fn(name);
							},
							error: function(res) 
							{
								var msg = (res.responseText != null && res.responseText) ?
									res.responseText : res.statusText;
								
								try
								{
									var tmp = JSON.parse(msg);
									
									if (tmp != null && tmp.errorMessages != null &&
										tmp.errorMessages.length > 0)
									{
										msg = tmp.errorMessages[0];
									}
								}
								catch (e)
								{
									// ignore
								}
								
								err(name, msg);
							}
						});
					}
				};
				
				var currentXml = null;
				
				window.addEventListener('message', function(evt)
				{
					if (evt.origin == editorHost)
					{
						var msg = JSON.parse(evt.data);
						
						if (msg.event == 'save')
						{
							currentXml = msg.xml;
							
							if (diagramName != null)
							{
								saveDiagram(msg.xml, true);
							}
							else
							{
								promptName('');
							}
						}
						else if (msg.event == 'prompt')
						{
							iframe.contentWindow.postMessage(JSON.stringify({action: 'spinner',
								show: true, messageKey: 'inserting'}));

							checkName(msg.value, function(name)
							{
								iframe.contentWindow.postMessage(JSON.stringify({action: 'spinner',
									show: false}));
								diagramName = name;
								saveDiagram(currentXml, true);
							},
							function(name, err, errKey)
							{
								iframe.contentWindow.postMessage(JSON.stringify({action: 'spinner',
									show: false}));
								promptName(name, err, errKey);
							});
						}
						else if (msg.event == 'exit')
						{
							AP.dialog.close();
						}
			            else if (msg.event == 'textContent')
			            {
			                saveContentSearchBody(issueId, diagramName, msg.message.diagramId, msg.data,
			                		closeDialog, closeDialog);    //ignore error and just exit
			            }
			            else if (msg.event == 'remoteInvoke')
		            	{
			            	handleRemoteInvoke(msg);
		            	}
					}
				});
				
				sendRemoteInvReady();
		   	}
		   	else
		   	{
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
					
					iframe.contentWindow.postMessage(JSON.stringify({action: 'spinner', show: false}));
					
					//TODO find how to listen to flag close event, currently just close the editor immediately
    				//messages.onClose(message, function()
    				//{
    					AP.dialog.close();
    				//});
				}, timeout);
				
				function loadErr()
				{
					window.clearTimeout(timeoutThread);
					
					if (acceptResponse)
					{
						closeDialog();
					}
				};

				AP.request({
					url: '/rest/api/2/attachment/content/' + diagramId,
					success: function(resp)
					{
			    		window.clearTimeout(timeoutThread);
			    		
			    		if (acceptResponse)
				    	{
							function xmlReady(xml)
							{		
								filename = displayName || diagramName;
								xmlReceived = xml;
								startEditor();
								
								window.addEventListener('message', function(evt)
								{
									if (evt.origin == editorHost)
									{
										var msg = JSON.parse(evt.data);
										
										if (msg.event == 'save')
										{
											saveDiagram(msg.xml, false);
										}
										else if (msg.event == 'exit')
										{
											AP.dialog.close();
										}
										//TODO Merge message event listener into one only!
										else if (msg.event == 'textContent')
										{
											saveContentSearchBody(issueId, diagramName, msg.message.diagramId, msg.data,
													closeDialog, closeDialog);    //ignore error and just exit
										}
										else if (msg.event == 'remoteInvoke')
										{
											handleRemoteInvoke(msg);
										}
									}
								});
								
								sendRemoteInvReady();
							};

							if (isOpc)
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
													xmlReady(str);
												}
												else
												{
													loadErr();
												}
											});
										}
										
									});

									if (!drawioFound)
									{
										loadErr();
									}
								}, loadErr); 
							}
							else
							{
								xmlReady(resp);
							}
						}
					},
					error: loadErr,
					binaryAttachment: isOpc
				});
		   	}
		};

		AP.dialog.getCustomData(function(customData_p)
		{
			customData = customData_p || {};
			doMain();
		});
	};
	
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
})();