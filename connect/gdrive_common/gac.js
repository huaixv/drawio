//TODO Some functions are the same as OneDrive AC except for minor changes [sometimes only the URLs and constants are different] 
//		(note also that google doesn't return the refresh token with every request + in office add-in we save the local storage differently)
var GAC = {};

GAC.host = window.location.host;
GAC.appId = '671128082532';
GAC.clientId = '671128082532-jhphbq6d0e1gnsus9mn7vf8a6fjn10mp.apps.googleusercontent.com';
GAC.redirectUri = window.location.protocol + '//' + GAC.host + '/google';
GAC.scopes = ['https://www.googleapis.com/auth/drive.file',
	'https://www.googleapis.com/auth/userinfo.profile']; 
//When 3rd party coookies are disabled, localStorage is not accessable
try
{
	GAC.isLocalStorage = typeof window.localStorage !== 'undefined';
}
catch(e){}

GAC.authLSKeyName = 'oDrawGDrive'; //Should be the same name as in draw.io
GAC.GDriveBaseUrl = 'https://www.googleapis.com/drive/v2';
GAC.reqQueue = [];
GAC.authOnProgress = false;
GAC.failIfNotAuth = false;
GAC.refreshTokenQueue = [];
GAC.refreshTokenInProgress = false;

if (typeof CAC === 'undefined') 
{
	throw 'CAC object not found, please include file new_common/cac.js';
}
else
{
	CAC.applyCAC(GAC);
}

(function()
{

var _token = null;

GAC.setToken = function(token)
{
	_token = token;
};

GAC.getUserInfo = function(success, error)
{
	GAC.doAuthRequestPlain('https://www.googleapis.com/oauth2/v2/userinfo?alt=json', 'GET', null, function(resp)
	{
		success(JSON.parse(resp.responseText));
	}, error);
};

GAC.getAuthWinUrl = function(state)
{
	 return 'https://accounts.google.com/o/oauth2/v2/auth?client_id=' + GAC.clientId +
				'&redirect_uri=' + encodeURIComponent(GAC.redirectUri) + 
				'&response_type=code&access_type=offline&prompt=consent%20select_account&include_granted_scopes=true' +
				'&scope=' + encodeURIComponent(GAC.scopes.join(' ')) +
				'&state=' + encodeURIComponent('cId=' + GAC.clientId + '&domain=' + GAC.host + '&token=' + state); //To identify which app/domain is used
};

GAC.authGDrive = function(success, errorFn, direct, authDlgCont)
{
	function error(err)
	{
		notifyWaiters('error', err);
	}
	
	function notifyWaiters(fnKey, arg)
	{
		for (var i = 0; i < GAC.reqQueue.length; i++)
		{
			GAC.reqQueue[i][fnKey](arg);
		}
		
		GAC.reqQueue = [];
		GAC.authOnProgress = false;
	}

	GAC.reqQueue.push({success: success, error: errorFn});
	
	if (GAC.authOnProgress)
	{
		return;
	}
	
	GAC.authOnProgress = true;
	
	if (window.onGoogleDriveCallback == null)
	{
		var authStep2 = function(state)
		{
			var acceptAuthResponse = true;
			
			var url = GAC.getAuthWinUrl(state);

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
			var popup = window.open(url, 'gdauth', features.join(','));
			
			if (popup != null)
			{
				window.onGoogleDriveCallback = function(authInfo)
				{
					try
					{
						if (acceptAuthResponse)
						{
							window.onGoogleDriveCallback = null;
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
									
									//get user and store the userId and expiration time
									GAC.getUserInfo(function(userInfo)
									{
										GAC.setPersistentAuth(userInfo.id, authInfo.expires_in);
									}, function()
									{
										//Ignore?
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
								popup.close();
							}
						}
						else
						{
							popup.close();
						}
					}
					finally
					{
						authDialog.parentNode.removeChild(authDialog);
					}
				};
			
				popup.focus();
			}
			else
			{
				alert(mxResources.get('errGAuthWinBlocked'));
			}
		};
		
		var auth = function()
		{
			GAC.getState(GAC.redirectUri, authStep2, error);
		};

		if (direct)
		{
			auth();
		}
		else
		{
			if (window.spinner != null)
			{
				spinner.stop();
			}
			
			var authDialog = document.createElement('div');
			var btn = document.createElement('button');
			btn.innerHTML = mxResources.get('authDrawAccess', ['Google Drive']);
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
GAC.doAuthRequest = function(url, method, params, success, error, authNeededCallback, authDlgCont)
{
	GAC.doAuthRequestPlain(GAC.GDriveBaseUrl + url, method, params, function(req)
	{
		success(JSON.parse(req.responseText));
	}, error, null, null, null, null, null, authNeededCallback, authDlgCont);
};

//JSON request with auth
GAC.doAuthRequestPlain = function(url, method, params, success, error, contentType, isBinary, retryCount, isBlob, failIfNotAuth, authNeededCallback, authDlgCont)
{
	if (GAC.refreshTokenInProgress)
	{
		GAC.refreshTokenQueue.push({args: arguments, error: error});
		return;
	}
	
	function notifyError(err)
	{
		error(err);
		notifyWaiters(true, err);
	};
	
	function notifyWaiters(isError, arg)
	{
		GAC.refreshTokenInProgress = false;
		
		for (var i = 0; i < GAC.refreshTokenQueue.length; i++)
		{
			if (isError)
			{
				GAC.refreshTokenQueue[i].error(arg);
			}
			else
			{
				GAC.doAuthRequestPlain.apply(this, GAC.refreshTokenQueue[i].args);
			}
		}
							
		GAC.refreshTokenQueue = [];
	};
	
	failIfNotAuth = failIfNotAuth != null? failIfNotAuth : GAC.failIfNotAuth;
	retryCount = retryCount || 0;
	
	if (retryCount > 4)
	{
		//Since we tried multiple times, the token itself maybe corrupted
		GAC.setPersistentAuth(null);
		error();
		return;
	}
	
	function doRefreshToken(userId, state)
	{
		var req = new XMLHttpRequest();
		req.open('GET', GAC.redirectUri + '?userId=' + userId +
				'&state=' + encodeURIComponent('cId=' + GAC.clientId + '&domain=' + GAC.host + '&token=' + state)); //To identify which app/domain is used
		
		req.onreadystatechange = function()
		{
			if (this.readyState == 4)
			{
				if (this.status >= 200 && this.status <= 299)
				{
					var newAuthInfo = JSON.parse(req.responseText);
					_token = newAuthInfo.access_token;
					
					GAC.setPersistentAuth(userId, newAuthInfo.expires_in);

					//Retry request with refreshed token
					GAC.doAuthRequestPlain(url, method, params, success, error, contentType, isBinary, ++retryCount, isBlob);
					notifyWaiters();
				}
				else // (Unauthorized) [e.g, invalid refresh token] (sometimes, the server returns errors other than 401 (e.g. 500))
				{
					if (failIfNotAuth)
					{
						notifyError({authNeeded: true, GD: true});
					}
					else
					{
						if (authNeededCallback != null)
						{
							authNeededCallback();	
						}

						GAC.authGDrive(function()
						{
							//Retry request after authentication
							GAC.doAuthRequestPlain(url, method, params, success, error, contentType, isBinary, ++retryCount, isBlob);
							notifyWaiters();
						}, notifyError, false, authDlgCont);
					}
				}
			}
		}
		
		req.send();
	};
	
	function startRefreshToken(userId)
	{
		GAC.refreshTokenInProgress = true;
		
		GAC.getState(GAC.redirectUri, function(state)
		{
			doRefreshToken(userId, state);
		}, notifyError);
	};
				
	if (_token == null)
	{
		var authInfo = GAC.getPersistentAuth();
		
		if (authInfo == null || authInfo.userId == null)
		{
			if (failIfNotAuth)
			{
				error({authNeeded: true, GD: true});
			}
			else
			{
				if (authNeededCallback != null)
				{
					authNeededCallback();	
				}
				
				GAC.authGDrive(function()
				{
					//Retry request after authentication
					GAC.doAuthRequestPlain(url, method, params, success, error, contentType, isBinary, ++retryCount, isBlob);
				}, error, false, authDlgCont);
			}
		}
		else
		{
			startRefreshToken(authInfo.userId);
		}
		
		return;
	}
	
	var req = new XMLHttpRequest();
	req.open(method, url);
	req.setRequestHeader('Authorization', 'Bearer ' + _token);
	req.setRequestHeader('Content-Type', contentType || 'application/json;charset=UTF-8');
	
	req.onreadystatechange = function()
	{
		if (this.readyState == 4)
		{
			if (this.status >= 200 && this.status <= 299)
			{
				success(req);
			}
			else if (this.status == 401) // (Unauthorized) [e.g, invalid token]
			{
				//Try refresh token before asking for new authentication
				var authInfo = GAC.getPersistentAuth();
				
				if (authInfo != null && authInfo.userId != null)
				{
					startRefreshToken(authInfo.userId);
				}
				else
				{
					if (failIfNotAuth)
					{
						error({authNeeded: true, GD: true});
					}
					else
					{
						if (authNeededCallback != null)
						{
							authNeededCallback();	
						}
						
						GAC.authGDrive(function()
						{
							//Retry request after authentication
							GAC.doAuthRequestPlain(url, method, params, success, error, contentType, isBinary, ++retryCount, isBlob);
						}, error, false, authDlgCont);
					}
				}
			}
			else
			{
				error(this);
			}
		}
	};
	
	if (isBinary && req.overrideMimeType)
	{
		req.overrideMimeType('text/plain; charset=x-user-defined');
	}
	
	if (isBlob)
	{
		req.responseType = 'blob';
	}
	
	req.send(params != null? JSON.stringify(params) : null);
};

GAC.showError = function(e)
{
	alert(GAC.htmlEntities(mxResources.get('confError', [e? e.message : ''])));
};

GAC.getFileInfo = function(id, success, error, authNeededCallback, authDlgCont)
{
	GAC.doAuthRequest('/files/' + id +
	        '?fields=id,title,mimeType,modifiedDate,downloadUrl,thumbnailLink,webViewLink,embedLink,fileSize,lastModifyingUser,owners' +
	        '&supportsAllDrives=true',
			 'GET', null, success, error, authNeededCallback, authDlgCont);
};

GAC.setOrigin = function(origin)
{
	GAC.origin = origin;
};

GAC.getOrigin = function()
{
	return GAC.origin || GAC.getUrlParam('xdm_e', true) || (window.location.protocol + '//' + window.location.host);
};

GAC.pickFile = function(fn, acceptFolders, extra, cancelFn)
{
	acceptFolders = acceptFolders || false;
	
	var view1 = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
	    .setParent('root')
	    .setIncludeFolders(true)
	    .setSelectFolderEnabled(acceptFolders)
	    .setMimeTypes('*/*');
	
	var view2 = new google.picker.DocsView()
		.setIncludeFolders(true)
		.setSelectFolderEnabled(acceptFolders);
	
	var view3 = new google.picker.DocsView()
		.setEnableDrives(true)
		.setIncludeFolders(true)
		.setSelectFolderEnabled(acceptFolders);
	
	var dim = GAC.getDocDim();
	
	var builder = new google.picker.PickerBuilder()
		.addView(view1)
		.addView(view2)
		.addView(view3);
	
	if (extra)
	{
		builder = builder.addView(new google.picker.DocsUploadView()
									.setIncludeFolders(true))
						 .addView(google.picker.ViewId.RECENTLY_PICKED);
	}
	
	builder.setOAuthToken(_token)
		.setLocale(window.mxLanguage)
		.enableFeature(google.picker.Feature.SUPPORT_DRIVES)
		.setCallback(function(data)
		{
			  if (data[google.picker.Response.ACTION] == google.picker.Action.PICKED)
		      {
				  	picker.setVisible(false);
				    var doc = data[google.picker.Response.DOCUMENTS][0];
				    
				    GAC.getFileInfo(doc.id, function(fullDoc)
				    {
				    	fn(fullDoc);
				    }, function()
				    {
				    	fn(doc);
				    });
		      }

			  if (cancelFn != null && data[google.picker.Response.ACTION] == google.picker.Action.CANCEL)
		      {
		    	  cancelFn();
		      }
		})
		.setOrigin(GAC.getOrigin())
		.setSize(dim.w - 10, dim.h - 10);
				
	var picker = builder.build();		
	picker.setVisible(true);
};

GAC.confirmGDAuth = function(success, error, failIfNotAuth, authDlgCont)
{
	GAC.doAuthRequestPlain('https://www.googleapis.com/oauth2/v2/userinfo',
			 'GET', null, success, error, null, null, null, null, failIfNotAuth, null, authDlgCont);
};

//This function depends on having GraphViewer loaded
GAC.extractGraphModelFromPng = function(pngData)
{
	return Editor.extractGraphModelFromPng(pngData);
};

GAC.getBinaryFile = function(file, success, error)
{
	if (file['downloadUrl'] == null)
	{
		GAC.getFileInfo(file.id, function(completeFile)
		{
			GAC.getBinaryFile(completeFile, success, error);
		}, error);
		
		return;
	}
	
	GAC.doAuthRequestPlain(file['downloadUrl'], 'GET', null, function(req)
	{
		success(req.response);
	}, error, null, null, null, true);
};

//This function depends on having GraphViewer loaded
GAC.getDrawioFileDoc = function(file, success, error, doCheck)
{
	if (file['downloadUrl'] == null)
	{
		GAC.getFileInfo(file.id, function(completeFile)
		{
			GAC.getDrawioFileDoc(completeFile, success, error, doCheck);
		}, error);
		
		return;
	}
	
	var isPng = file.mimeType == 'image/png';
	
	GAC.doAuthRequestPlain(file['downloadUrl'], 'GET', null, function(req)
	{
		try 
		{
			var cnt = req.responseText;
			
			if (isPng)
			{
				cnt = 'data:image/png;base64,' + Editor.base64Encode (cnt);
				cnt = GAC.extractGraphModelFromPng(cnt);
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
	
		error();

	}, error, null, isPng);
};

//This function depends on having GraphViewer loaded
GAC.checkDrawioFile = function(file, success, error)
{
	GAC.getDrawioFileDoc(file, success, error, true);
};

GAC.setPersistentAuth = function(userId, expires_in)
{
	if (GAC.isLocalStorage)
	{
		if (userId != null)
		{
			localStorage.setItem('.' + GAC.authLSKeyName, JSON.stringify({
											userId: userId,
											expires: Date.now() + parseInt(expires_in) * 1000
										}));
		} 
		else
		{
			var authInfo = GAC.getPersistentAuth();
			
			if (authInfo != null && authInfo.userId != null)
			{
				var req = new XMLHttpRequest();
				req.open('GET', GAC.redirectUri + '?doLogout=1&userId=' + authInfo.userId + '&state=' + encodeURIComponent('cId=' + GAC.clientId + '&domain=' + GAC.host));
				req.send();
			}
			
			_token = null;
			localStorage.removeItem('.' + GAC.authLSKeyName);
		}
	}
};

GAC.getPersistentAuth = function()
{
	var authInfo = null;
	
	if (GAC.isLocalStorage)
	{
		try
		{
			authInfo = JSON.parse(localStorage.getItem('.' + GAC.authLSKeyName));
		}
		catch(e) {} // ignore
	}
	
	return authInfo;
};

GAC.checkDrawioApp = function(success)
{
	GAC.doAuthRequest('/apps/' + GAC.appId, 'GET', null, function(resp)
	{
		success(resp.installed);
	}, GAC.noop);
};

})();