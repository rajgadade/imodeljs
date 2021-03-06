/*---------------------------------------------------------------------------------------------
* Copyright (c) 2018 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/

import { Schema } from "./Schema";
import { SchemaItem } from "./SchemaItem";
import { EnumerationProps, EnumeratorProps } from "./../Deserialization/JsonProps";
import { PrimitiveType, SchemaItemType } from "./../ECObjects";
import { ECObjectsError, ECObjectsStatus } from "./../Exception";
import { SchemaItemVisitor } from "./../Interfaces";
import { ECName } from "./../SchemaKey";

export interface Enumerator<T> {
  readonly name: string;
  readonly value: T;
  readonly label?: string;
  readonly description?: string;
}

export type AnyEnumerator = Enumerator<string | number>;

/**
 * A Typescript class representation of an ECEnumeration.
 */
export class Enumeration extends SchemaItem {
  public readonly schemaItemType!: SchemaItemType.Enumeration; // tslint:disable-line
  protected _type?: PrimitiveType.Integer | PrimitiveType.String;
  protected _isStrict: boolean;
  protected _enumerators: AnyEnumerator[];

  get enumerators() { return this._enumerators; }
  get type() { return this._type; }
  get isStrict() { return this._isStrict; }

  constructor(schema: Schema, name: string, primitiveType?: PrimitiveType.Integer | PrimitiveType.String) {
    super(schema, name);
    this.schemaItemType = SchemaItemType.Enumeration;
    this._type = primitiveType;
    this._isStrict = true;
    this._enumerators = [];
  }

  public get isInt(): boolean { return this._type === PrimitiveType.Integer; }
  public get isString(): boolean { return this._type === PrimitiveType.String; }

  /**
   * Gets an enumerator that matches the name provided.
   * @param name The ECName of the Enumerator to find.
   */
  public getEnumeratorByName(name: string): AnyEnumerator | undefined {
    return this.enumerators.find((item) => item.name.toLowerCase() === name.toLowerCase());
  }

  /**
   * Gets an enumerator that matches the value provided.
   * @param value The value of the Enumerator to find.
   */
  public getEnumerator(value: string): Enumerator<string> | undefined;
  public getEnumerator(value: number): Enumerator<number> | undefined;
  public getEnumerator(value: string | number): AnyEnumerator | undefined {
    return this.enumerators.find((item) => item.value === value);
  }

  /** @hidden
   * Checks whether there already exists an enumerator with this name or this value
   * @param name The name of the enumerator we are trying to create
   * @param value The value of the enumerator we are trying to create
   */
  private findDuplicateEnumerators(name: string, value: string | number) {
    this._enumerators.forEach((element: AnyEnumerator) => { // Name and value must be unique within the ECEnumerations
      if (element.name.toLowerCase() === name.toLowerCase())
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Enumeration ${this.name} has a duplicate Enumerator with name '${name}'.`);
      if (element.value === value)
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Enumeration ${this.name} has a duplicate Enumerator with value '${value}'.`);
    });
  }

  /**
   * Creates an Enumerator with the provided name and value as well as optional parameters label and description
   * @param name The name of the enumerator
   * @param value The value of the enumerator. The type of this value is dependent on the backing type of the this Enumeration.
   * @param label A localized display label that is used instead of the name in a GUI.
   * @param description A localized description for the enumerator.
   * @return AnyEnumerator object
   */
  public createEnumerator(name: string, value: string | number, label?: string, description?: string): AnyEnumerator {
    if (this.isInt && typeof (value) === "string") // throws if backing type is int and value is string
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Enumeration ${this.name} has a backing type 'integer' and an enumerator with value of type 'string'.`);
    if (!this.isInt && typeof (value) === "number") // also throws if backing type is string and value is number
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Enumeration ${this.name} has a backing type 'string' and an enumerator with value of type 'integer'.`);
    this.findDuplicateEnumerators(name, value); // check for duplicates; throw if there are any
    if (!ECName.validate(name))
      throw new ECObjectsError(ECObjectsStatus.InvalidECName, `The Enumeration ${this.name} has an enumerator with an invalid 'name' attribute. ${name} is not a valid ECName.`);
    return { name, value, label, description };
  }

  /**
   * Adds enumerator to list of enumerators on this Enumeration
   * @param enumerator The enumerator to add
   */
  protected addEnumerator(enumerator: AnyEnumerator) {
    this.enumerators.push(enumerator);
  }

  public toJson(standalone: boolean, includeSchemaVersion: boolean) {
    const schemaJson = super.toJson(standalone, includeSchemaVersion);
    schemaJson.type = (this.isInt) ? "int" : "string";
    schemaJson.isStrict = this.isStrict;
    schemaJson.enumerators = [];
    this._enumerators.forEach((element: AnyEnumerator) => {
      const enumJson: any = {};
      enumJson.name = element.name;
      enumJson.value = element.value;
      if (undefined !== element.label)
        enumJson.label = element.label;
      if (undefined !== element.description)
        enumJson.description = element.description;
      schemaJson.enumerators.push(enumJson);
    });
    return schemaJson;
  }

  public deserializeSync(enumerationProps: EnumerationProps) {
    super.deserializeSync(enumerationProps);
    if (undefined === this._type) {
      if (/int/i.test(enumerationProps.type))
        this._type = PrimitiveType.Integer;
      else if (/string/i.test(enumerationProps.type))
        this._type = PrimitiveType.String;
      else
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Enumeration ${this.name} has an invalid 'type' attribute. It should be either "int" or "string".`);
    } else {
      const primitiveTypePattern = (this.isInt) ? /int/i : /string/i;
      if (!primitiveTypePattern.test(enumerationProps.type))
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Enumeration ${this.name} has an incompatible type. It must be "${(this.isInt) ? "int" : "string"}", not "${(this.isInt) ? "string" : "int"}".`);
    }
    this._isStrict = enumerationProps.isStrict;

    if (undefined !== enumerationProps.enumerators) {
      enumerationProps.enumerators.forEach((enumerator: EnumeratorProps) => {
        // Creates a new enumerator (with the specified name, value, label and description- label and description are optional) and adds to the list of enumerators.
        // Throws ECObjectsError if there are duplicate names or values present in the enumeration
        this.addEnumerator(this.createEnumerator(enumerator.name, enumerator.value, enumerator.label, enumerator.description));
      });
    }
  }

  public async deserialize(enumerationProps: EnumerationProps) {
    this.deserializeSync(enumerationProps);
  }

  public async accept(visitor: SchemaItemVisitor) {
    if (visitor.visitEnumeration)
      await visitor.visitEnumeration(this);
  }
}

/** @hidden */
export abstract class MutableEnumeration extends Enumeration {
  public abstract addEnumerator(enumerator: AnyEnumerator): void;
}
