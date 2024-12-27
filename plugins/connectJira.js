/**
 * Plugin for embed mode in JIRA Connect.
 */
Draw.loadPlugin(function(ui)
{
	var diagInfo = {};
	
	mxEvent.addListener(window, 'message', mxUtils.bind(this, function(evt)
	{
		var data = evt.data;

		try
		{
			data = JSON.parse(data);
			
			if (data.action == 'load')
			{
				if (data.diagInfo != null) 
				{
					diagInfo = data.diagInfo;

					if (ui.format != null)
					{
						ui.format.refresh();
					}
				}
			}
		}
		catch (e)
		{
			data = null;
		}
	}));

	// Adds new section for Jira cloud
	var diagramFormatPanelInit = DiagramFormatPanel.prototype.init;
	
	DiagramFormatPanel.prototype.init = function()
	{
		this.container.appendChild(this.addViewerOptions(this.createPanel()));
		
		diagramFormatPanelInit.apply(this, arguments);
	};
	
	// Adds viewer config to style options and refreshes
	DiagramFormatPanel.prototype.addViewerOptions = function(div)
	{
		var ui = this.editorUi;
		var editor = ui.editor;
		var graph = editor.graph;
	
		div.appendChild(this.createTitle(mxResources.get('viewerSettings')));	
		
		//Page and layers settings
		div.appendChild(this.createTitle(mxResources.get('pageLayers', null, 'Page and Layers')));
		
		var hasAspect = false;
		var pageId = null, layerIds = null;
		
		var customizeBtn = mxUtils.button(mxResources.get('customize', null, 'Customize'), function()
		{
			
			var dlg = new AspectDialog(ui, pageId, layerIds, function(info)
			{
				pageId = info.pageId;
				layerIds = info.layerIds;
				diagInfo.aspect = pageId + ' ' + layerIds.join(' ');
				ui.remoteInvoke('setAspect', [diagInfo.aspect], null, function(){}, function(){}); //Notify plugin of the change, ignoring both success and error callbacks
			});
			
			ui.showDialog(dlg.container, 700, 465, true, true);
			dlg.init();
		});
		
		customizeBtn.style.marginLeft = '10px';
		customizeBtn.style.padding = '4px';
		customizeBtn.setAttribute('disabled', 'disabled');
		
		if (diagInfo.aspect != null)
		{
			var aspectArray = diagInfo.aspect.split(' ');
			
			if (aspectArray.length > 0)
			{
				pageId = aspectArray[0];
				layerIds = aspectArray.slice(1);
				hasAspect = true;
				customizeBtn.removeAttribute('disabled');
			}
		}
		
		var firstPageRadio = ui.addRadiobox(div, 'pageLayers', mxResources.get('firstPage', null, 'First Page (All Layers)'), !hasAspect);
		firstPageRadio.style.marginTop = '4px';
		
		mxEvent.addListener(firstPageRadio, 'change', function()
		{
			if (this.checked)
			{
				diagInfo.aspect = null;
				ui.remoteInvoke('setAspect', [diagInfo.aspect], null, function(){}, function(){}); //Notify plugin of the change, ignoring both success and error callbacks
				customizeBtn.setAttribute('disabled', 'disabled');
			}
		});
		
		var currentStateRadio = ui.addRadiobox(div, 'pageLayers', mxResources.get('curEditorState', null, 'Current Editor State'), false);
		currentStateRadio.style.marginTop = '8px';
		
		mxEvent.addListener(currentStateRadio, 'change', function()
		{
			if (this.checked)
			{
				var curPage = ui.updatePageRoot(ui.currentPage);
				var layerIds = [], layers = curPage.root.children;
				
				for (var i = 0; i < layers.length; i++)
				{
					if (layers[i].visible != false)
					{
						layerIds.push(layers[i].id);
					}
				}
	
				diagInfo.aspect = curPage.getId() + ' ' + layerIds.join(' ');
				ui.remoteInvoke('setAspect', [diagInfo.aspect], null, function(){}, function(){}); //Notify plugin of the change, ignoring both success and error callbacks
				customizeBtn.setAttribute('disabled', 'disabled');
			}
		});
	
		var customStateRadio = ui.addRadiobox(div, 'pageLayers', mxResources.get('custom', null, 'Custom'), hasAspect, false, true);
		customStateRadio.style.marginTop = '8px';
		
		mxEvent.addListener(customStateRadio, 'change', function()
		{
			if (this.checked)
			{
				customizeBtn.removeAttribute('disabled');
			}
		});
	
		div.appendChild(customizeBtn);
	
		return div;
	};

	Editor.enableChatGpt = true;
});
