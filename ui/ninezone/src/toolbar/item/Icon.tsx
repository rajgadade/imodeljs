/*---------------------------------------------------------------------------------------------
* Copyright (c) 2018 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module Toolbar */

import * as classnames from "classnames";
import * as React from "react";
import CommonProps from "../../utilities/Props";
import "./Icon.scss";

/** Properties of [[Item]] component */
export interface ItemProps extends CommonProps {
  /** button icon. */
  icon?: React.ReactNode;
  /** Describes if item is active. */
  isActive?: boolean;
  /** Describes if the item is disabled. */
  isDisabled?: boolean;
  /** Function called when the item is clicked. */
  onClick?: () => void;
  /** Title for the item. */
  title?: string;
}

/** Toolbar item component. Used in [[Toolbar]] */
export default class Item extends React.Component<ItemProps> {
  public render() {
    const className = classnames(
      "nz-toolbar-item-icon",
      this.props.isActive && "nz-is-active",
      this.props.isDisabled && "nz-is-disabled",
      this.props.className);

    return (
      <button
        disabled={this.props.isDisabled}  // this is needed to prevent focusing/keyboard access to disabled buttons
        onClick={this._handleClick}
        className={className}
        style={this.props.style}
        title={this.props.title}
      >
        <div className="nz-icon">
          {this.props.icon}
        </div>
      </button>
    );
  }

  private _handleClick = () => {
    if (this.props.isDisabled)
      return;

    this.props.onClick && this.props.onClick();
  }
}
