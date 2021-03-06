/*---------------------------------------------------------------------------------------------
* Copyright (c) 2018 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";

import { ConfigurableUiManager } from "@bentley/ui-framework";
import { WidgetControl } from "@bentley/ui-framework";
import { ConfigurableCreateInfo } from "@bentley/ui-framework";
import { ContentControl } from "@bentley/ui-framework";

import { Orientation } from "@bentley/ui-core";
import {
  PropertyDescription, PropertyRecord, PropertyValueFormat, PrimitiveValue,
  PropertyGrid, SimplePropertyDataProvider, PropertyValue, PropertyUpdatedArgs, PropertyCategory,
} from "@bentley/ui-components";

class SamplePropertyRecord extends PropertyRecord {
  constructor(name: string, index: number, value: any, typename: string = "string", editor?: string) {
    const v = {
      valueFormat: PropertyValueFormat.Primitive,
      value,
      displayValue: value.toString(),
    } as PrimitiveValue;
    const p = {
      name: name + index,
      displayLabel: name,
      typename,
    } as PropertyDescription;
    if (editor)
      p.editor = { name: editor, params: [] };
    super(v, p);

    this.description = `${name} - description`;
    this.isReadonly = false;
  }
}

class SamplePropertyDataProvider extends SimplePropertyDataProvider {

  constructor() {
    super();

    this.addCategory({ name: "Group_1", label: "Group 1", expand: true });
    this.addCategory({ name: "Group_2", label: "Miscellaneous", expand: false });
    this.addCategory({ name: "Geometry", label: "Geometry", expand: true });

    const categoryCount = this.categories.length;

    for (let i = 0; i < categoryCount; i++) {
      for (let iVolume = 0; iVolume < 10; iVolume++) {

        const enumPropertyRecord = new SamplePropertyRecord("Enum", iVolume, 0, "enum");
        enumPropertyRecord.property.enum = { choices: [], isStrict: false };
        enumPropertyRecord.property.enum.choices = [
          { label: "Yellow", value: 0 },
          { label: "Red", value: 1 },
          { label: "Green", value: 2 },
          { label: "Blue", value: 3 },
        ];

        const booleanPropertyRecord = new SamplePropertyRecord("Boolean", iVolume, true, "boolean");
        // booleanPropertyRecord.editorLabel = "Optional CheckBox Label";

        const propData = [
          [
            new SamplePropertyRecord("CADID", iVolume, "0000 0005 00E0 02D8"),
            new SamplePropertyRecord("ID_Attribute", iVolume, "34B72774-E885-4FB7-B031-64D040E37322"),
            new SamplePropertyRecord("Name", iVolume, "DT1002"),
            enumPropertyRecord,
          ],
          [
            new SamplePropertyRecord("ID", iVolume, "34B72774-E885-4FB7-B031-64D040E37322", ""),
            new SamplePropertyRecord("Model", iVolume, "Default"),
            new SamplePropertyRecord("Level", iVolume, "Default"),
            booleanPropertyRecord,
          ],
          [
            new SamplePropertyRecord("Area", iVolume, "6.1875", "ft2"),
            new SamplePropertyRecord("Height", iVolume, "1.375", "ft"),
            new SamplePropertyRecord("Width", iVolume, "4.5", "ft"),
            new SamplePropertyRecord("Integer", iVolume, "5", "", "int"),
            new SamplePropertyRecord("Float", iVolume, "7.0", "", "float"),
          ],
        ];

        // tslint:disable-next-line:prefer-for-of
        for (let j = 0; j < propData[i].length; j++) {
          this.addProperty(propData[i][j], i);
        }
      }
    }
  }
}

export class VerticalPropertyGridWidgetControl extends WidgetControl {
  constructor(info: ConfigurableCreateInfo, options: any) {
    super(info, options);

    super.reactElement = <VerticalPropertyGridWidget />;
  }
}

class VerticalPropertyGridWidget extends React.Component {
  private _dataProvider: SamplePropertyDataProvider;

  constructor(props: any) {
    super(props);

    this._dataProvider = new SamplePropertyDataProvider();
  }

  private _updatePropertyRecord(record: PropertyRecord, newValue: string): PropertyRecord {
    const propertyValue: PropertyValue = {
      valueFormat: PropertyValueFormat.Primitive,
      value: newValue,
      displayValue: newValue.toString(),
    };
    return record.copyWithNewValue(propertyValue);
  }

  private _handlePropertyUpdated = async (args: PropertyUpdatedArgs, category: PropertyCategory): Promise<boolean> => {
    let updated = false;

    if (args.propertyRecord) {
      const newRecord = this._updatePropertyRecord(args.propertyRecord, args.newValue);
      const catIdx = this._dataProvider.findCategoryIndex(category);
      if (catIdx >= 0)
        this._dataProvider.replaceProperty(args.propertyRecord, catIdx, newRecord);
      updated = true;
    }

    return updated;
  }

  public render() {
    return (
      <PropertyGrid dataProvider={this._dataProvider} orientation={Orientation.Vertical} isPropertySelectionEnabled={true}
        isPropertyEditingEnabled={true} onPropertyUpdated={this._handlePropertyUpdated} />
    );
  }
}

ConfigurableUiManager.registerControl("VerticalPropertyGridDemoWidget", VerticalPropertyGridWidgetControl);

export class HorizontalPropertyGridWidgetControl extends WidgetControl {
  constructor(info: ConfigurableCreateInfo, options: any) {
    super(info, options);

    this.reactElement = <HorizontalPropertyGridWidget />;
  }
}

class HorizontalPropertyGridWidget extends React.Component {
  private _dataProvider: SamplePropertyDataProvider;

  constructor(props: any) {
    super(props);

    this._dataProvider = new SamplePropertyDataProvider();
  }

  private _updatePropertyRecord(record: PropertyRecord, newValue: string): PropertyRecord {
    const propertyValue: PropertyValue = {
      valueFormat: PropertyValueFormat.Primitive,
      value: newValue,
      displayValue: newValue.toString(),
    };
    return record.copyWithNewValue(propertyValue);
  }

  private _handlePropertyUpdated = async (args: PropertyUpdatedArgs, category: PropertyCategory): Promise<boolean> => {
    let updated = false;

    if (args.propertyRecord) {
      const newRecord = this._updatePropertyRecord(args.propertyRecord, args.newValue);
      const catIdx = this._dataProvider.findCategoryIndex(category);
      if (catIdx >= 0)
        this._dataProvider.replaceProperty(args.propertyRecord, catIdx, newRecord);
      updated = true;
    }

    return updated;
  }

  public render() {
    return (
      <PropertyGrid dataProvider={this._dataProvider} orientation={Orientation.Horizontal}
        isPropertyEditingEnabled={true} onPropertyUpdated={this._handlePropertyUpdated} />
    );
  }
}

ConfigurableUiManager.registerControl("HorizontalPropertyGridDemoWidget", HorizontalPropertyGridWidgetControl);

export class HorizontalPropertyGridContentControl extends ContentControl {
  constructor(info: ConfigurableCreateInfo, options: any) {
    super(info, options);

    this.reactElement = <HorizontalPropertyGridContent />;
  }
}

class HorizontalPropertyGridContent extends React.Component {
  private _dataProvider: SamplePropertyDataProvider;

  constructor(props: any) {
    super(props);

    this._dataProvider = new SamplePropertyDataProvider();
  }

  private _updatePropertyRecord(record: PropertyRecord, newValue: string): PropertyRecord {
    const propertyValue: PropertyValue = {
      valueFormat: PropertyValueFormat.Primitive,
      value: newValue,
      displayValue: newValue.toString(),
    };
    return record.copyWithNewValue(propertyValue);
  }

  private _handlePropertyUpdated = async (args: PropertyUpdatedArgs, category: PropertyCategory): Promise<boolean> => {
    let updated = false;

    if (args.propertyRecord) {
      const newRecord = this._updatePropertyRecord(args.propertyRecord, args.newValue);
      const catIdx = this._dataProvider.findCategoryIndex(category);
      if (catIdx >= 0)
        this._dataProvider.replaceProperty(args.propertyRecord, catIdx, newRecord);
      updated = true;
    }

    return updated;
  }

  public render(): React.ReactNode {
    return (
      <PropertyGrid dataProvider={this._dataProvider} orientation={Orientation.Horizontal} isPropertySelectionEnabled={true}
        isPropertyEditingEnabled={true} onPropertyUpdated={this._handlePropertyUpdated} />
    );
  }
}

ConfigurableUiManager.registerControl("HorizontalPropertyGridDemoContent", HorizontalPropertyGridContentControl);
