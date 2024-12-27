//Add compatibility with existing AC of confluence
if (typeof AC === 'undefined')
{
	AC = {};
}

AC.host = window.location.host;

switch(AC.host)
{
	case 'test.draw.io':
		AC.clientId = '95e4b4ed-ed5c-4a05-935b-b411b4562ef2';
	break;
	case 'ac.draw.io':
		AC.clientId = 'aae1c620-4caf-41b3-9633-f6d0b6347dd9';
	break;
	case 'aj.draw.io':
		AC.clientId = '1afa9b7e-2533-4d86-83c0-c4d4678eca0e';
	break;
	default:
		AC.clientId = '24b129a6-117b-4394-bdc8-3b9955e5cdef';
}

AC.redirectUri = window.location.protocol + '//' + AC.host + '/microsoft';
AC.pickerRedirectUri = window.location.protocol + '//' + AC.host + '/onedrive3.html';
AC.defEndpoint = 'api.onedrive.com'; //This is the default endpoint for personal accounts
AC.scopes = 'user.read files.read.all offline_access files.readwrite.all sites.read.all'; //Files.ReadWrite.All is needed for personal accounts createLink (embedded) and also for editing diagrams on draw.io

//When 3rd party coookies are disabled, localStorage is not accessable
try
{
	AC.isLocalStorage = typeof window.localStorage !== 'undefined';
}
catch(e){}

AC.authLSKeyName = 'oneDriveAuthInfo'; //The same name as in draw.io
AC.OneDriveBaseUrl = 'https://graph.microsoft.com/v1.0';
AC.reqQueue = [];
AC.authOnProgress = false;
AC.failIfNotAuth = false;
AC.refreshTokenQueue = [];
AC.refreshTokenInProgress = false;

if (typeof CAC === 'undefined') 
{
	throw 'CAC object not found, please include file new_common/cac.js';
}
else
{
	CAC.applyCAC(AC);
}

(function()
{

var _token = null;

AC.setToken = function(token)
{
	_token = token;
};

AC.authOneDrive = function(success, errorFn, direct, authDlgCont)
{
	function error(err)
	{
		notifyWaiters('error', err);
	}
	
	function notifyWaiters(fnKey, arg)
	{
		for (var i = 0; i < AC.reqQueue.length; i++)
		{
			AC.reqQueue[i][fnKey](arg);
		}
		
		AC.reqQueue = [];
		AC.authOnProgress = false;
	}
	
	AC.reqQueue.push({success: success, error: errorFn});
	
	if (AC.authOnProgress)
	{
		return;
	}
	
	AC.authOnProgress = true;
	
	if (window.onOneDriveCallback == null)
	{
		var authStep2 = function(state)
		{
			var acceptAuthResponse = true;
			
			var url = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize' +
				'?client_id=' + AC.clientId + '&response_type=code' +
				'&redirect_uri=' + encodeURIComponent(AC.redirectUri) +
				'&scope=' + encodeURIComponent(AC.scopes) +
				'&state=' + encodeURIComponent('cId=' + AC.clientId + '&domain=' + AC.host + '&token=' + state); //To identify which app/domain is used

			var width = 525,
				height = 525,
				screenX = window.screenX,
				screenY = window.screenY,
				outerWidth = window.outerWidth,
				outerHeight = window.outerHeight;
			
			var left = screenX + Math.max(outerWidth - width, 0) / 2;
			var top = screenY + Math.max(outerHeight - height, 0) / 2;
			
			var features = ['width=' + width, 'height=' + height,
			                'top=' + top, 'left=' + left,
			                'status=no', 'resizable=yes',
			                'toolbar=no', 'menubar=no',
			                'scrollbars=yes'];
			var popup = window.open(url, 'odauth', features.join(','));
			
			if (popup != null)
			{
				window.onOneDriveCallback = function(authInfo, authWindow)
				{
					try
					{
						if (acceptAuthResponse)
						{
							window.onOneDriveCallback = null;
							acceptAuthResponse = false;
							
							try
							{
								if (authInfo == null)
								{
									error({message: mxResources.get('accessDenied'), retry: auth});
								}
								else
								{
									_token = authInfo.access_token;
									
									AC.setPersistentAuth({
										expiresOn: Date.now() + authInfo.expires_in * 1000,
										remember: true
									});
									
									notifyWaiters('success');
								}
							}
							catch (e)
							{
								error(e);
							}
							finally
							{
								if (authWindow != null)
								{
									authWindow.close();
								}
							}
						}
						else if (authWindow != null)
						{
							authWindow.close();
						}
					}
					finally
					{
						authDialog.parentNode.removeChild(authDialog);
					}
				};
			
				popup.focus();
			}
		};
		
		var auth = function()
		{
			AC.getState(AC.redirectUri, authStep2, error);
		};
		
		if (direct)
		{
			auth();
		}
		else
		{
			var authDialog = document.createElement('div');
			var btn = document.createElement('button');
			btn.innerHTML = mxResources.get('authDrawAccess', ['OneDrive']);
			btn.className = 'aui-button aui-button-primary';
			authDialog.appendChild(btn);
			
			function adjustAuthBtn()
			{
				var w = authDlgCont? authDlgCont.offsetWidth : window.innerWidth, 
					h = authDlgCont? authDlgCont.offsetHeight : window.innerHeight;
				authDialog.style.cssText = 'position: absolute; top: 0px; left: 0px; width: '+ w +'px; height: '+ h +'px; background: var(--ds-surface-overlay, #fff);opacity: 0.85;z-index: 9999;';
				btn.style.cssText = 'position: absolute; width: ' + (authDlgCont? '250; font-size: 12px' : '320px') + '; height: 50px; top: '+ (h/2 - 25) +'px; left: '+ (w/2 - (authDlgCont? 125 : 160)) +'px;opacity: 1;';
			}
	
			btn.addEventListener('click', function(evt) 
			{
				auth();
				//Remove the event handler since the user already used the button
				window.removeEventListener("resize", adjustAuthBtn);
			});
			
			window.addEventListener('resize', adjustAuthBtn);
			adjustAuthBtn();
			(authDlgCont || document.body).appendChild(authDialog);
		}
	}
	else
	{
		error({message: mxResources.get('busy')});
	}
};

//JSON request with auth
AC.doAuthRequest = function(url, method, params, success, error, failIfNotAuth, authNeededCallback, authDlgCont)
{
	if (AC.refreshTokenInProgress)
	{
		AC.refreshTokenQueue.push({args: arguments, error: error});
		return;
	}
	
	function notifyError(err)
	{
		error(err);
		notifyWaiters(true, err);
	};
	
	function notifyWaiters(isError, arg)
	{
		AC.refreshTokenInProgress = false;
		
		for (var i = 0; i < AC.refreshTokenQueue.length; i++)
		{
			if (isError)
			{
				AC.refreshTokenQueue[i].error(arg);
			}
			else
			{
				AC.doAuthRequest.apply(this, AC.refreshTokenQueue[i].args);
			}
		}
							
		AC.refreshTokenQueue = [];
	};
	
	failIfNotAuth = failIfNotAuth != null? failIfNotAuth : AC.failIfNotAuth;
	//Try refresh token before asking for new authentication
	function doRefreshToken(state)
	{
		var req2 = new XMLHttpRequest();
		req2.open('GET', AC.redirectUri + '?state=' + encodeURIComponent('cId=' + AC.clientId + '&domain=' + AC.host + '&token=' + state)); //To identify which app/domain is used
		
		req2.onreadystatechange = function()
		{
			if (this.readyState == 4)
			{
				if (this.status >= 200 && this.status <= 299)
				{
					var newAuthInfo = JSON.parse(req2.responseText);
					_token = newAuthInfo.access_token;
					
					AC.setPersistentAuth({
						expiresOn: Date.now() + newAuthInfo.expires_in * 1000,
						remember: true
					});
					//Retry request with refreshed token
					AC.doAuthRequest(url, method, params, success, error);
					notifyWaiters();
				}
				else // (Unauthorized) [e.g, invalid refresh token] (sometimes, the server returns errors other than 401 (e.g. 500))
				{
					if (failIfNotAuth)
					{
						notifyError({authNeeded: true, OD: true});
					}
					else
					{
						if (authNeededCallback != null)
						{
							authNeededCallback();	
						}
						
						AC.authOneDrive(function()
						{
							//Retry request after authentication
							AC.doAuthRequest(url, method, params, success, error);
							notifyWaiters();
						}, notifyError, null, authDlgCont);
					}
				}
			}
		}
		
		req2.send();
	};
					
	function startRefreshToken()
	{
		AC.refreshTokenInProgress = true;		
		AC.getState(AC.redirectUri, doRefreshToken, notifyError);
	};
	
	if (_token == null)
	{
		var authInfo = AC.getPersistentAuth();
		
		if (authInfo == null)
		{
			if (failIfNotAuth)
			{
				error({authNeeded: true, OD: true});
			}
			else
			{
				if (authNeededCallback != null)
				{
					authNeededCallback();	
				}

				AC.authOneDrive(function()
				{
					//Retry request after authentication
					AC.doAuthRequest(url, method, params, success, error);
				}, error, null, authDlgCont);
			}
		}
		else
		{
			startRefreshToken();
		}
		
		return;
	}
	
	var req = new XMLHttpRequest();
	req.open(method, AC.OneDriveBaseUrl + url);
	req.setRequestHeader('Authorization', 'Bearer ' + _token);
	req.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
	
	req.onreadystatechange = function()
	{
		if (this.readyState == 4)
		{
			if (this.status >= 200 && this.status <= 299)
			{
				success(JSON.parse(req.responseText));
			}
			else if (this.status == 401) // (Unauthorized) [e.g, invalid token]
			{
				//Try refresh token before asking for new authentication
				var authInfo = AC.getPersistentAuth();
				
				if (authInfo != null)
				{
					startRefreshToken();
				}
				else
				{
					if (failIfNotAuth)
					{
						error({authNeeded: true, OD: true});
					}
					else
					{
						if (authNeededCallback != null)
						{
							authNeededCallback();	
						}

						AC.authOneDrive(function()
						{
							//Retry request after authentication
							AC.doAuthRequest(url, method, params, success, error);
						}, error, null, authDlgCont);
					}
				}
			}
			else
			{
				error(this);
			}
		}
	};
	
	req.send(params != null? JSON.stringify(params) : null);
};

AC.showError = function(e)
{
	alert(AC.htmlEntities(mxResources.get('confError', [e? e.message : ''])));
};

AC.pickFile = function(fn)
{
	OneDrive.open(
	{
		clientId: AC.clientId,
		action: 'query',
		multiSelect: false,
		advanced:
		{
			'endpointHint': AC.endpointHint,
			'redirectUri': AC.pickerRedirectUri,
			'accessToken': _token,
			'queryParameters': 'select=id,name,parentReference,file,createdBy,lastModifiedBy,lastModifiedDateTime,size,@microsoft.graph.downloadUrl',
			isConsumerAccount: false
		},
		success: function(files)
		{
			if (files != null && files.value != null && files.value.length > 0)
			{
				fn(files.value[0]);
			}
		},
		cancel: function()
		{
			// do nothing
		},
		error: AC.showError
	});
};

AC.getFilePreviewUrl = function(file, success, error)
{
	AC.getPreviewUrl(file.id, file.parentReference.driveId, success, error);
};

AC.getPreviewUrl = function(id, driveId, success, error)
{
	if (AC.isPersonal)
	{
//		AC.doAuthRequest('/drives/' + driveId + 
//				 '/items/' + id + '/createLink',
//				 'POST', {type: 'embed'}, function(resp)
//				 {
//					success(resp.link.webUrl, true);
//				 }, error);	
		error(mxResources.get('personalAccNotSup'));
	}
	else
	{
		AC.doAuthRequest('/drives/' + driveId + 
				 '/items/' + id + '/preview',
				 'POST', null, function(resp)
				 {
					success(resp.getUrl);
				 }, error);
	}
};

AC.getFileThumbnailUrl = function(file, success, error)
{
	AC.getThumbnailUrl(file.id, file.parentReference.driveId, success, error);
};

AC.getThumbnailUrl = function(id, driveId, success, error)
{
	AC.doAuthRequest('/drives/' + driveId + 
			 '/items/' + id + '/thumbnails',
			 'GET', null, function(resp)
			 {
				if (resp.value && resp.value[0] && resp.value[0].small)
				{
					success(resp.value[0].small.url, resp.value[0]);
				}
				else
				{
					success(null);
				}
			 }, error);
};

AC.getFileInfo = function(id, driveId, success, error, authNeededCallback, authDlgCont)
{
	AC.doAuthRequest('/drives/' + driveId + '/items/' + id,
			 'GET', null, success, error, null, authNeededCallback, authDlgCont);
};

AC.confirmODAuth = function(success, error, failIfNotAuth, authDlgCont)
{
	AC.doAuthRequest('/me/drive/root',
			 'GET', null, function(resp)
			 {
			 	if (resp.webUrl.indexOf('.sharepoint.com') > 0) 
			 	{
					AC.endpointHint = resp.webUrl.replace('/Documents', '/_layouts/15/onedrive.aspx');
					AC.isPersonal = false;
				}
				else
				{
					AC.endpointHint = AC.defEndpoint;
					AC.isPersonal = true;
				}
				
			 	//Update authInfo with endpointHint
			 	var authInfo = AC.getPersistentAuth();
				
				if (authInfo != null)
				{
				 	authInfo.endpointHint = AC.endpointHint;
				 	AC.setPersistentAuth(authInfo);
			 	}
			
				success(resp);
			 }, error, failIfNotAuth, null, authDlgCont);
};

//This function depends on having GraphViewer loaded
AC.extractGraphModelFromPng = function(pngData)
{
	return Editor.extractGraphModelFromPng(pngData);
};

AC.getBinaryFile = function(file, success, error)
{
	if (file['@microsoft.graph.downloadUrl'] == null)
	{
		if (file.parentReference == null)
		{
			throw new Error(mxResources.get('notADiagramFile'));
		}
		else
		{
			AC.getFileInfo(file.id, file.parentReference.driveId, function(completeFile)
			{
				AC.getBinaryFile(completeFile, success, error);
			}, error);
			
			return;
		}
	}

	var req = new XMLHttpRequest();
	req.open('GET', file['@microsoft.graph.downloadUrl']);
	req.responseType = 'blob';
	
	req.onreadystatechange = function()
	{
		if (this.readyState == 4)
		{
			if (this.status >= 200 && this.status <= 299)
			{
				success(req.response);
			}
			else
			{
				error();
			}
		}
	};
	
	req.send();
};

//This function depends on having GraphViewer loaded
AC.getDrawioFileDoc = function(file, success, error, doCheck)
{
	if (file['@microsoft.graph.downloadUrl'] == null)
	{
		if (file.parentReference == null)
		{
			throw new Error(mxResources.get('notADiagramFile'));
		}
		else
		{
			AC.getFileInfo(file.id, file.parentReference.driveId, function(completeFile)
			{
				AC.getDrawioFileDoc(completeFile, success, error, doCheck);
			}, error);
			
			return;
		}
	}
	
	var req = new XMLHttpRequest();
	//TODO find another way to disable caching (adding a parameter breaks the url)
	req.open('GET', file['@microsoft.graph.downloadUrl']);
	var isPng = file.file? (file.file.mimeType == 'image/png') : false;
	
	req.onreadystatechange = function()
	{
		if (this.readyState == 4)
		{
			if (this.status >= 200 && this.status <= 299)
			{
				try 
				{
					var cnt = req.responseText;
					
					if (isPng)
					{
						cnt = 'data:image/png;base64,' + Editor.base64Encode (cnt);
						cnt = AC.extractGraphModelFromPng(cnt);
					}
					
					var doc = mxUtils.parseXml(cnt);

					if (!doCheck || new Editor().extractGraphModel(doc.documentElement) != null)
					{
						file.isDrawio = true;
						success(doc, cnt, true);
						return;
					}
				}
				catch(e) {} //on error and if the doc is null, the following line will call the error
			}
			
			error();
		}
	};
	
	if (isPng && req.overrideMimeType)
	{
		req.overrideMimeType('text/plain; charset=x-user-defined');
	}
	
	req.send();
};

//This function depends on having GraphViewer loaded
AC.checkDrawioFile = function(file, success, error)
{
	AC.getDrawioFileDoc(file, success, error, true);
};

AC.removeLink = function(issueId, fileId, callback, error)
{
    var updateInfo = function(resp)
    {
    	resp = JSON.parse(resp);
    	var linksInfo = resp.value;
        
    	if (linksInfo[fileId] == null)
		{
    		error({message: mxResources.get('fileNotFound')});
    		return;
		}
        
    	delete linksInfo[fileId];
    	
        AP.request({
            url: '/rest/api/2/issue/' + issueId + '/properties/onedrive-conn-data',
            type: 'PUT',
            data: JSON.stringify(linksInfo),
            contentType: 'application/json;charset=UTF-8',
            success: function()
            {
            	callback();
            },
            error : error
        });
    };
    
    AP.request({
        url: '/rest/api/2/issue/' + issueId + '/properties/onedrive-conn-data',
        type: 'GET',
        success: updateInfo,
        error : error
    });
};

AC.saveLink = function(issueId, file, callback, error)
{
    var updateInfo = function(resp)
    {
    	var linksInfo = {};
    	
        if (!resp.status) //no error
        {
        	resp = JSON.parse(resp);
            linksInfo = resp.value;
        }
        
        var order = null, max = -1;
        
        for (var key in linksInfo)
    	{
        	if (key == file.id)
    		{
        		order = linksInfo[key].order;
        		break;
    		}
        	
        	max = Math.max(linksInfo[key].order, max);
    	}
        
        if (order == null)
    	{
        	order = max + 1;
    	}
        
        linksInfo[file.id] = {
    		service: file.service,
        	isDrawio: file.isDrawio,
        	aspect: file.aspect,
        	order: order
        };

        var fileObj = linksInfo[file.id];
        
        switch (file.service)
    	{
        	case 'OneDrive':
        		fileObj.driveId = file.parentReference.driveId;
        		fileObj.createdBy = file.createdBy && file.createdBy.user? file.createdBy.user.displayName : null;
        		fileObj.lastModifiedBy = file.lastModifiedBy && file.lastModifiedBy.user? file.lastModifiedBy.user.displayName : null;
				fileObj.modifiedDate = file.lastModifiedDateTime;
				fileObj.embeddedUrl = file.embeddedUrl;
				fileObj.mime = file.file? file.file.mimeType : null;
				fileObj.name = file.name;
				fileObj.size = file.size;
    		break;
        	case 'AttFile':
				fileObj.mime = file.type;
				fileObj.name = file.name;
				fileObj.size = file.size;
				fileObj.modifiedDate = file.lastModified;
    		break;
        	case 'GDrive':
        		fileObj.createdBy = file.owners && file.owners[0]? file.owners[0].displayName : null;
        		fileObj.lastModifiedBy = file.lastModifyingUser? file.lastModifyingUser.displayName : null;
				fileObj.modifiedDate = file.modifiedDate;
				fileObj.mime = file.mimeType;
				fileObj.name = file.title;
				fileObj.size = file.fileSize;
    		break;
    	}

        AP.request({
            url: '/rest/api/2/issue/' + issueId + '/properties/onedrive-conn-data',
            type: 'PUT',
            data: JSON.stringify(linksInfo),
            contentType: 'application/json;charset=UTF-8',
            success: function()
            {
            	callback();
            },
            error : error
        });
    };
    
    AP.request({
        url: '/rest/api/2/issue/' + issueId + '/properties/onedrive-conn-data',
        type: 'GET',
        success: updateInfo,
        error : updateInfo
    });
};

AC.setPersistentAuth = function(authInfo)
{
	if (AC.isLocalStorage)
	{
		if (authInfo != null)
		{
			localStorage.setItem('.' + AC.authLSKeyName, JSON.stringify(authInfo));
		} 
		else
		{
			var req = new XMLHttpRequest();
			req.open('GET', AC.redirectUri + '?doLogout=1&&state=' + encodeURIComponent('cId=' + AC.clientId + '&domain=' + AC.host));
			req.send();
			_token = null;
			localStorage.removeItem('.' + AC.authLSKeyName);
		}
	}
};

AC.getPersistentAuth = function()
{
	var authInfo = null;
	
	if (AC.isLocalStorage)
	{
		try
		{
			authInfo = JSON.parse(localStorage.getItem('.' + AC.authLSKeyName));
		}
		catch (e){} // ignore
	}
	
	return authInfo;
};

//GraphViewer should be loaded before using this function
AC.extractDataFromPng = function(pngData, dataHeader)
{
	var result = null;
	
	try
	{
		var base64 = pngData.substring(pngData.indexOf(',') + 1);

		// Workaround for invalid character error in Safari & IE11
		var binary = (window.atob && !mxClient.IS_SF && !mxClient.IS_IE11) ? atob(base64) : Base64.decode(base64, true);
		
		EditorUi.parsePng(binary, function(pos, type, length)
		{
			var value = binary.substring(pos + 8, pos + 8 + length);
			
			if (type == 'zTXt')
			{
				var idx = value.indexOf(String.fromCharCode(0));
				
				if (value.substring(0, idx) == dataHeader)
				{
					// Workaround for Java URL Encoder using + for spaces, which isn't compatible with JS
					var data = Graph.bytesToString(pako.inflateRaw(
						value.substring(idx + 2))).replace(/\+/g,' ');
					
					if (data != null && data.length > 0)
					{
						result = data;
					}
				}
			}
			// Uncompressed section is normally not used
			else if (type == 'tEXt')
			{
				var vals = value.split(String.fromCharCode(0));
				
				if (vals.length > 1 && vals[0] == dataHeader)
				{
					result = vals[1];
				}
			}
			
			if (result != null || type == 'IDAT')
			{
				// Stops processing the file as our text chunks
				// are always placed before the data section
				return true;
			}
		});
	}
	catch (e)
	{
		// ignores decoding errors
	}
	
	if (result != null && result.charAt(0) == '%')
	{
		result = decodeURIComponent(result);
	}
	
	// Workaround for double encoded content
	if (result != null && result.charAt(0) == '%')
	{
		result = decodeURIComponent(result);
	}
	
	return result;
};

})();