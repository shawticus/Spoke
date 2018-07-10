import React, { Component } from "react";
import PropTypes from "prop-types";
import { DragDropContextProvider } from "react-dnd";
import HTML5Backend from "react-dnd-html5-backend";
import { MosaicWindow } from "react-mosaic-component";
import { HotKeys } from "react-hotkeys";
import Modal from "react-modal";
import { MosaicWithoutDragDropContext } from "react-mosaic-component";
import MenuBarContainer from "./menus/MenuBarContainer";
import FileDialogModalContainer from "./modals/FileDialogModalContainer";
import ViewportPanelContainer from "./panels/ViewportPanelContainer";
import ViewportPanelToolbarContainer from "./panels/ViewportPanelToolbarContainer";
import HierarchyPanelContainer from "./panels/HierarchyPanelContainer";
import PropertiesPanelContainer from "./panels/PropertiesPanelContainer";
import AssetExplorerPanelContainer from "./panels/AssetExplorerPanelContainer";
import PanelToolbar from "./PanelToolbar";
import { withProject } from "./contexts/ProjectContext";
import { withEditor } from "./contexts/EditorContext";
import { last } from "../utils";
import styles from "../common.scss";

class EditorContainer extends Component {
  static defaultProps = {
    initialPanels: {
      direction: "column",
      first: {
        direction: "row",
        first: {
          direction: "row",
          first: "hierarchy",
          second: "viewport",
          splitPercentage: 33.333
        },
        second: "properties",
        splitPercentage: 75
      },
      second: "assetExplorer",
      splitPercentage: 70
    }
  };

  static propTypes = {
    initialPanels: PropTypes.object,
    editor: PropTypes.object,
    project: PropTypes.object
  };

  constructor(props) {
    super(props);

    window.addEventListener("resize", this.onWindowResize, false);

    this.state = {
      registeredPanels: {
        hierarchy: {
          component: HierarchyPanelContainer,
          windowProps: {
            title: "Hierarchy",
            toolbarControls: PanelToolbar
          }
        },
        viewport: {
          component: ViewportPanelContainer,
          windowProps: {
            title: "Viewport",
            toolbarControls: ViewportPanelToolbarContainer(),
            draggable: true
          }
        },
        properties: {
          component: PropertiesPanelContainer,
          windowProps: {
            title: "Properties",
            toolbarControls: PanelToolbar
          }
        },
        assetExplorer: {
          component: AssetExplorerPanelContainer,
          windowProps: {
            title: "Asset Explorer",
            toolbarControls: PanelToolbar
          }
        }
      },
      openModal: null,
      keyMap: {
        translateTool: "w",
        rotateTool: "e",
        scaleTool: "r",
        delete: ["del", "backspace"],
        duplicate: ["ctrl+d", "command+d"],
        save: ["ctrl+s", "command+s"],
        saveAs: ["ctrl+shift+s", "command+shift+s"],
        undo: ["ctrl+z", "command+z"],
        redo: ["ctrl+shift+z", "command+shift+z"],
        bundle: ["ctrl+b", "command+b"]
      },
      menus: [
        {
          name: "File",
          items: [
            {
              name: "New Scene",
              action: () => console.log("New Scene")
            },
            {
              name: "Save Scene",
              action: () => console.log("Save Scene")
            },
            {
              name: "Save Scene As...",
              action: () => console.log("Save Scene As...")
            },
            {
              name: "Export Scene...",
              action: () => console.log("Export Scene...")
            }
          ]
        },
        {
          name: "Help",
          items: [
            {
              name: "Keyboard Shortcuts",
              action: () => console.log("Keyboard Shortcuts")
            },
            {
              name: "Getting Started",
              action: () => console.log("Getting Started")
            },
            {
              name: "Documentation",
              action: () => console.log("Documentation")
            }
          ]
        }
      ],
      globalHotKeyHandlers: {
        undo: this.onUndo,
        redo: this.onRedo,
        save: this.onSave,
        saveAs: this.onSaveAs,
        bundle: this.onOpenBundleModal
      }
    };
  }

  componentDidMount() {
    this.props.editor.signals.windowResize.dispatch();
    this.props.editor.signals.popScene.add(this.onPopScene);
    this.props.editor.signals.openScene.add(this.onOpenScene);
    this.props.editor.signals.sceneGraphChanged.add(this.onSceneChanged);
    this.props.project.addListener("change", path => {
      const url = new URL(path, window.location).href;
      this.props.editor.signals.fileChanged.dispatch(url);
    });
  }

  componentDidUpdate(prevProps) {
    if (this.props.project !== prevProps.project && prevProps.project) {
      prevProps.project.close();
    }
  }

  componentWillUnmount() {
    if (this.props.project) {
      this.props.project.close();
    }

    window.removeEventListener("resize", this.onWindowResize, false);
  }

  onWindowResize = () => {
    this.props.editor.signals.windowResize.dispatch();
  };

  onPanelChange = () => {
    this.props.editor.signals.windowResize.dispatch();
  };

  onCloseModal = () => {
    this.setState({
      openModal: null
    });
  };

  onUndo = () => {
    this.props.editor.undo();
  };

  onRedo = () => {
    this.props.editor.redo();
  };

  openSaveAsDialog(onSave) {
    this.setState({
      openModal: {
        component: FileDialogModalContainer,
        shouldCloseOnOverlayClick: true,
        props: {
          title: "Save scene as...",
          confirmButtonLabel: "Save as...",
          filter: ".scene",
          onConfirm: onSave,
          onCancel: this.onCloseModal
        }
      }
    });
  }

  onSave = async e => {
    e.preventDefault();

    if (!this.props.editor.sceneURI || this.props.editor.sceneURI.endsWith(".gltf")) {
      this.openSaveAsDialog(this.exportAndSaveScene);
    } else {
      this.exportAndSaveScene(this.props.editor.sceneURI);
    }
  };

  onSaveAs = e => {
    e.preventDefault();
    this.openSaveAsDialog(this.exportAndSaveScene);
  };

  exportAndSaveScene = async sceneURI => {
    try {
      const serializedScene = this.props.editor.serializeScene(sceneURI);
      await this.props.project.writeJSON(sceneURI, serializedScene);

      this.props.editor.setSceneURI(sceneURI);
      this.props.editor.sceneInfo.modified = false;
      this.setState({
        openModal: null
      });
    } catch (e) {
      throw e;
    }
  };

  onOpenBundleModal = e => {
    e.preventDefault();

    if (!this.props.editor.sceneURI) {
      console.warn("TODO: save scene before bundling instead of doing nothing");
      return;
    }

    this.setState({
      openModal: {
        component: FileDialogModalContainer,
        shouldCloseOnOverlayClick: true,
        props: {
          title: "Select glTF bundle output directory",
          confirmButtonLabel: "Bundle scene...",
          directory: true,
          onConfirm: this.onBundle,
          onCancel: this.onCloseModal
        }
      }
    });
  };

  onBundle = async outputPath => {
    await this.props.project.bundleScene(this.props.editor.scene.name, "0.1.0", this.props.editor.sceneURI, outputPath);
    this.setState({ openModal: null });
  };

  onSceneChanged = () => {
    document.title = `Hubs Editor - ${this.props.editor.scene.name}*`;
  };

  confirmSceneChange = () => {
    return (
      !this.props.editor.sceneModified() ||
      confirm("This scene has unsaved changes. Do you really want to really want to change scenes without saving?")
    );
  };

  onPopScene = () => {
    if (!this.confirmSceneChange()) return;
    this.props.editor.popScene();
  };

  onOpenScene = uri => {
    const uriPath = new URL(this.props.editor.sceneURI, window.location);
    if (uriPath.pathname === uri) return;
    if (!this.confirmSceneChange()) return;

    const url = new URL(uri, window.location);

    this.props.editor
      .openRootScene(url.href)
      .then(scene => {
        document.title = `Hubs Editor - ${scene.name}`;
      })
      .catch(e => {
        console.error(e);
      });
  };

  renderPanel = (panelId, path) => {
    const panel = this.state.registeredPanels[panelId];

    return (
      <MosaicWindow path={path} {...panel.windowProps}>
        <panel.component {...panel.props} />
      </MosaicWindow>
    );
  };

  render() {
    const { openModal, menus } = this.state;

    const { initialPanels } = this.props;

    return (
      <DragDropContextProvider backend={HTML5Backend}>
        <HotKeys keyMap={this.state.keyMap} handlers={this.state.globalHotKeyHandlers} className={styles.flexColumn}>
          <MenuBarContainer menus={menus} />
          <MosaicWithoutDragDropContext
            className="mosaic-theme"
            renderTile={this.renderPanel}
            initialValue={initialPanels}
            onChange={this.onPanelChange}
          />
          <Modal
            ariaHideApp={false}
            isOpen={!!openModal}
            onRequestClose={this.onCloseModal}
            shouldCloseOnOverlayClick={openModal && openModal.shouldCloseOnOverlayClick}
            className="Modal"
            overlayClassName="Overlay"
          >
            {openModal && <openModal.component {...openModal.props} />}
          </Modal>
        </HotKeys>
      </DragDropContextProvider>
    );
  }
}

export default withProject(withEditor(EditorContainer));