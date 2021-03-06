/*---------------------------------------------------------------------------------------------
* Copyright (c) 2018 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module Breadcrumb */

import * as React from "react";
import { using } from "@bentley/bentleyjs-core";
import { TableDataProvider, Table, RowItem, ColumnDescription, TableProps } from "../../table";
import { BreadcrumbTreeUtils, DataRowItem } from "../BreadcrumbTreeUtils";
import { TreeNodeItem, isTreeDataProviderInterface, DelayLoadedTreeNodeItem, ImmediatelyLoadedTreeNodeItem } from "../../tree";
import { BreadcrumbPath, BreadcrumbUpdateEventArgs } from "../BreadcrumbPath";
import { BeInspireTree, BeInspireTreeEvent, BeInspireTreeNodes, BeInspireTreeNode, toNodes, BeInspireTreeNodeConfig, MapPayloadToInspireNodeCallback } from "../../tree/component/BeInspireTree";

/** Property interface for the [[BreadcrumbDetails]] component */
export interface BreadcrumbDetailsProps {
  /** Path data object shared by Breadcrumb component */
  path: BreadcrumbPath;
  columns?: ColumnDescription[];
  renderTable?: (props: TableProps, node: TreeNodeItem | undefined, children: TreeNodeItem[]) => React.ReactNode;
  /** Callback triggered when child node is loaded with an asynchronous dataProvider. */
  onChildrenLoaded?: (parent: TreeNodeItem, children: TreeNodeItem[]) => void;
  /** Callback triggered when root nodes are loaded with an asynchronous dataProvider. */
  onRootNodesLoaded?: (nodes: TreeNodeItem[]) => void;
  /** @hidden */
  onRender?: () => void;
}

/** @hidden */
export interface BreadcrumbDetailsState {
  table?: TableDataProvider;
  childNodes?: TreeNodeItem[];
  modelReady: boolean;
}

/**
 * A Table containing all children of tree node specified in path.
 * Used in conjunction with [[Breadcrumb]] to see children of current path.
 */
export class BreadcrumbDetails extends React.Component<BreadcrumbDetailsProps, BreadcrumbDetailsState> {
  private _tree!: BeInspireTree<TreeNodeItem>;
  private _mounted: boolean = false;
  public static defaultProps: Partial<BreadcrumbDetailsProps> = {
    columns: [
      { key: "icon", label: "", icon: true },
      { key: "label", label: "Name" },
      { key: "description", label: "Description" },
    ],
  };

  public readonly state: BreadcrumbDetailsState;

  constructor(props: BreadcrumbDetailsProps) {
    super(props);
    this.state = {
      modelReady: isTreeDataProviderInterface(props.path.getDataProvider()) ? false : true,
    };
    this._recreateTree();
  }

  public componentDidMount() {
    this._mounted = true;
    /* istanbul ignore next */
    if (this.props.onRender)
      this.props.onRender();
    const dataProvider = this.props.path.getDataProvider();
    const node = this.props.path.getCurrentNode();
    this._updateTree(node ? this._tree.node(node.id) : undefined);
    if (isTreeDataProviderInterface(dataProvider) && dataProvider.onTreeNodeChanged)
      dataProvider.onTreeNodeChanged.addListener(this._treeChange);
    this.props.path.BreadcrumbUpdateEvent.addListener(this._pathChange);
  }

  public componentWillUnmount() {
    this._mounted = false;
    this._tree.removeAllListeners();
    const dataProvider = this.props.path.getDataProvider();
    if (isTreeDataProviderInterface(dataProvider) && dataProvider.onTreeNodeChanged)
      dataProvider.onTreeNodeChanged.removeListener(this._treeChange);
    this.props.path.BreadcrumbUpdateEvent.removeListener(this._pathChange);
  }

  public componentDidUpdate(prevProps: BreadcrumbDetailsProps) {
    /* istanbul ignore next */
    if (this.props.onRender)
      this.props.onRender();
    if (!this.props.path.BreadcrumbUpdateEvent.has(this._pathChange)) {
      this.props.path.BreadcrumbUpdateEvent.addListener(this._pathChange);
      if (prevProps.path) {
        prevProps.path.BreadcrumbUpdateEvent.removeListener(this._pathChange);
      }
    }
  }

  private _recreateTree() {
    this._tree = new BeInspireTree<TreeNodeItem>({
      dataProvider: this.props.path.getDataProvider(),
      renderer: this._onModelChanged,
      mapPayloadToInspireNodeConfig: BreadcrumbDetails.inspireNodeFromTreeNodeItem,
    });
    this._tree.on(BeInspireTreeEvent.ModelLoaded, this._onModelLoaded);
    this._tree.on(BeInspireTreeEvent.ChildrenLoaded, this._onChildrenLoaded);
    this._tree.ready.then(this._onModelReady); // tslint:disable-line:no-floating-promises
  }

  /** @hidden */
  public shouldComponentUpdate(nextProps: BreadcrumbDetailsProps, nextState: BreadcrumbDetailsState): boolean {
    if (this.state.modelReady !== nextState.modelReady) {
      // always render when state.modelReady changes
      return true;
    }

    if (!nextState.modelReady) {
      // if we got here and model is not ready - don't render
      return false;
    }

    const cNode = nextProps.path.getCurrentNode();
    const current = cNode ? this._tree.node(cNode.id) : undefined;
    // otherwise, render when any of the following props / state change
    return this.props.renderTable !== nextProps.renderTable
      || this.props.path !== nextProps.path
      || this.state.table !== nextState.table
      || (current !== undefined && current.isDirty());
  }

  private _onModelLoaded = (rootNodes: BeInspireTreeNodes<TreeNodeItem>) => {
    this._updateTree(undefined);
    if (this.props.onRootNodesLoaded)
      this.props.onRootNodesLoaded(rootNodes.map((n) => n.payload));
  }

  private _onChildrenLoaded = (parentNode: BeInspireTreeNode<TreeNodeItem>) => {
    const node = this.props.path.getCurrentNode();
    if (node) {
      const iNode = this._tree.node(node.id);
      this._updateTree(iNode);
    }
    const children = parentNode.getChildren();
    if (this.props.onChildrenLoaded)
      this.props.onChildrenLoaded(parentNode.payload, toNodes<TreeNodeItem>(children).map((c) => c.payload));
  }

  private _onModelChanged = (_visibleNodes: Array<BeInspireTreeNode<TreeNodeItem>>) => {
  }

  private _onModelReady = () => {
    if (this._mounted)
      this.setState({ modelReady: true });
  }

  private _onTreeNodeChanged = (items: Array<TreeNodeItem | undefined>) => {
    using((this._tree as any).pauseRendering(), async () => { // tslint:disable-line:no-floating-promises
      if (items) {
        for (const item of items) {
          if (item) {
            // specific node needs to be reloaded
            const node = this._tree.node(item.id);
            if (node) {
              node.assign(BreadcrumbDetails.inspireNodeFromTreeNodeItem(item, BreadcrumbDetails.inspireNodeFromTreeNodeItem.bind(this)));
              await node.loadChildren();
            }
          } else {
            // all root nodes need to be reloaded
            await this._tree.reload();
            await Promise.all(this._tree.nodes().map(async (n) => n.loadChildren()));
          }
        }
      }
    });
  }

  private static inspireNodeFromTreeNodeItem(item: TreeNodeItem, remapper: MapPayloadToInspireNodeCallback<TreeNodeItem>): BeInspireTreeNodeConfig {
    const node: BeInspireTreeNodeConfig = {
      id: item.id,
      text: item.label,
      itree: {
        state: { collapsed: false },
      },
    };
    if (item.icon)
      node.itree!.icon = item.icon;
    if ((item as DelayLoadedTreeNodeItem).hasChildren)
      node.children = true;
    else if ((item as ImmediatelyLoadedTreeNodeItem).children)
      node.children = (item as ImmediatelyLoadedTreeNodeItem).children!.map((p) => remapper(p, remapper));
    return node;
  }

  private _treeChange = () => {
    const currentNode = this.props.path.getCurrentNode();
    this._updateTree(currentNode ? this._tree.node(currentNode.id) : undefined);
  }
  private _pathChange = (args: BreadcrumbUpdateEventArgs) => {
    this._updateTree(args.currentNode ? this._tree.node(args.currentNode.id) : undefined);
    if (isTreeDataProviderInterface(args.oldDataProvider) && args.oldDataProvider.onTreeNodeChanged) {
      // unsubscribe from previous data provider `onTreeNodeChanged` events
      args.oldDataProvider.onTreeNodeChanged.removeListener(this._onTreeNodeChanged);
    }
    if (isTreeDataProviderInterface(args.dataProvider) && args.dataProvider.onTreeNodeChanged) {
      // subscribe for new data provider `onTreeNodeChanged` events
      args.dataProvider.onTreeNodeChanged.addListener(this._onTreeNodeChanged);
    }
  }
  private _updateTree = (node: BeInspireTreeNode<TreeNodeItem> | undefined) => {
    if (node && node.hasOrWillHaveChildren() && !(node as any).hasLoadedChildren())
      node.loadChildren(); // tslint:disable-line:no-floating-promises
    else {
      const childNodes = (node ? toNodes<TreeNodeItem>(node.getChildren()) : this._tree.nodes()).map((child) => child.payload);
      if (childNodes.length === 0) {
        const parents = node ? toNodes<TreeNodeItem>(node.getParents()).map((child) => child.payload) : [];
        parents.reverse();
        if (parents.length > 1)
          this.props.path.setCurrentNode(parents[parents.length - 2]);
        else if (parents.length === 1)
          this.props.path.setCurrentNode(undefined);
      }
      const table = BreadcrumbTreeUtils.aliasNodeListToTableDataProvider(childNodes, this.props.columns!, this.props.path.getDataProvider());
      this.setState({ table, childNodes });
    }
  }
  public render(): React.ReactNode {
    const node = this.props.path.getCurrentNode();
    if (node) {
      const iNode = this._tree.node(node.id);
      if (iNode) {
        iNode.setDirty(false);
      }
    }
    const { childNodes } = this.state;
    const renderTable = this.props.renderTable ? this.props.renderTable : this.renderTable;
    return (
      <div className="breadcrumb-details">
        {
          this.state.table && childNodes &&
          renderTable({
            dataProvider: this.state.table,
            onRowsSelected: async (rowIterator: AsyncIterableIterator<RowItem>, replace: boolean) => {
              const iteratorResult = await rowIterator.next();
              if (!iteratorResult.done) {
                const row = iteratorResult.value as DataRowItem;
                if ("_node" in row && row._node && row._node.hasChildren) {
                  this.props.path.setCurrentNode(row._node);
                }
              }
              return replace;
            },
          }, node, childNodes)
        }
      </div>
    );
  }

  // tslint:disable-next-line:naming-convention
  private renderTable = (props: TableProps, _node: TreeNodeItem | undefined, _children: TreeNodeItem[]) => {
    return <Table {...props} onRender={this.props.onRender} />;
  }
}
