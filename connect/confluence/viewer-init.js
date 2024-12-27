window.onerror = function(message, url, linenumber, colno, err)
{
	message = 'Confluence Cloud Viewer: ' + ((message != null) ? message : '');

	AC.logError(message, url, linenumber, colno, err);
};

// Parses URL parameters
function getUrlParam(param, treatEmptyAsNull)
{
	var result = (new RegExp(param + '=([^&]*)')).exec(window.location.search);
	
	if (result != null && result.length > 0)
	{
		var val = decodeURIComponent(result[1].replace(/\+/g, '%20'));
		return treatEmptyAsNull && val != null && val.length == 0 ? null : val;
	}
	
	return null;
};

function getBaseUrl()
{
	var baseUrl = getUrlParam('xdm_e', true) + getUrlParam('cp', true);
	return baseUrl;
};

/**
 * Synchronously adds scripts to the page.
 */
function mxscript(src, onLoad, id)
{
	var s = document.createElement('script');
	s.setAttribute('type', 'text/javascript');
	s.setAttribute('defer', 'true');
	s.setAttribute('src', src);

	if (id != null)
	{
		s.setAttribute('id', id);
	}
	
	if (onLoad != null)
	{
		var r = false;
	
		s.onload = s.onreadystatechange = function()
		{
			if (!r && (!this.readyState || this.readyState == 'complete'))
			{
				r = true;
				onLoad();
			}
		};
	}
	
	var t = document.getElementsByTagName('script')[0];
	
	if (t != null)
	{
		t.parentNode.insertBefore(s, t);
	}
};

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