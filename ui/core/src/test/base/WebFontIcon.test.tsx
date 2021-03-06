/*---------------------------------------------------------------------------------------------
* Copyright (c) 2018 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import { mount, shallow } from "enzyme";
import * as React from "react";
import { WebFontIcon } from "../../index";

describe("WebFontIcon", () => {

  it("should render", () => {
    mount(<WebFontIcon iconName="icon-placeholder" />);
  });

  it("renders correctly", () => {
    shallow(<WebFontIcon iconName="icon-placeholder" />).should.matchSnapshot();
  });

});
