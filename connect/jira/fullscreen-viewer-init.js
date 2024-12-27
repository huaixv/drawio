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

// Sets global environment variables
RESOURCE_BASE = '/resources/dia';
STENCIL_PATH = '/stencils';
SHAPES_PATH = '/shapes';
IMAGE_PATH = '/images';
STYLE_PATH = '/styles';
PROXY_URL = '/proxy';
// Math support
DRAW_MATH_URL = '/math/es5';

// Overrides browser language with Confluence user language
var lang = getUrlParam('loc');

// Language is in the Connect URL
if (lang != null)
{
	var dash = lang.indexOf('-');
	
	if (dash >= 0)
	{
		mxLanguage = lang.substring(0, dash);
	}
}
