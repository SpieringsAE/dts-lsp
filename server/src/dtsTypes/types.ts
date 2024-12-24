import { genIssue } from "../helpers";
import { type Node } from "../context/node";
import { Property } from "../context/property";
import { Issue, StandardTypeIssue } from "../types";
import { Runtime } from "../context/runtime";
import {
  CompletionItem,
  CompletionItemKind,
  DiagnosticSeverity,
} from "vscode-languageserver";
import { PropertyValue } from "../ast/dtc/values/value";
import { StringValue } from "../ast/dtc/values/string";
import { ASTBase } from "../ast/base";
import { ArrayValues } from "../ast/dtc/values/arrayValue";
import { LabelRef } from "../ast/dtc/labelRef";
import { NodePathRef } from "../ast/dtc/values/nodePath";

export enum PropetyType {
  EMPTY,
  U32,
  U64,
  STRING,
  PROP_ENCODED_ARRAY,
  STRINGLIST,
  BYTESTRING,
  UNKNOWN,
}

export interface Validate {
  validate: (runtime: Runtime, node: Node) => Issue<StandardTypeIssue>[];
}

export type RequirementStatus = "required" | "ommited" | "optional";

export type TypeConfig = { types: PropetyType[] };
export class PropertyNodeType<T = string | number> implements Validate {
  public readonly required: (node: Node) => RequirementStatus;
  public readonly values: (property: Property) => T[];
  public hideAutoComplete = false;
  public list = false;

  constructor(
    public readonly name: string | RegExp,
    public readonly type: TypeConfig[],
    required:
      | RequirementStatus
      | ((node: Node) => RequirementStatus) = "optional",
    public readonly def: T | undefined = undefined,
    values: T[] | ((property: Property) => T[]) = [],
    public readonly additionalTypeCheck?: (
      property: Property
    ) => Issue<StandardTypeIssue>[]
  ) {
    if (typeof required !== "function") {
      this.required = () => required;
    } else {
      this.required = required;
    }

    if (typeof values !== "function") {
      this.values = () =>
        def && values.indexOf(def) === -1 ? [def, ...values] : values;
    } else {
      this.values = values;
    }
  }

  getNameMatch(name: string): boolean {
    return typeof this.name === "string"
      ? this.name === name
      : !!name.match(this.name);
  }

  private validateProperty(
    runtime: Runtime,
    node: Node,
    propertyName: string,
    property?: Property
  ): Issue<StandardTypeIssue>[] {
    const required = this.required(node);
    if (!property) {
      if (required === "required") {
        const orderdTree = runtime.getOrderedNodeAst(node);
        return [
          genIssue<StandardTypeIssue>(
            StandardTypeIssue.REQUIRED,
            orderdTree[0],
            DiagnosticSeverity.Error,
            orderdTree.slice(1),
            [],
            [propertyName]
          ),
        ];
      }

      return [];
    } else if (required === "ommited") {
      return [
        genIssue<StandardTypeIssue>(
          StandardTypeIssue.OMITTED,
          property.ast,
          DiagnosticSeverity.Error,
          undefined,
          [],
          [propertyName]
        ),
      ];
    }

    const propTypes = propertyValuesToPropetyType(property);
    const issues: Issue<StandardTypeIssue>[] = [];

    const checkType = (
      expected: PropetyType[],
      type: PropetyType,
      ast: ASTBase | undefined | null
    ) => {
      ast ??= property.ast;

      const typeIsValid =
        expected.some((tt) => tt == type) ||
        (expected.some((tt) => tt == PropetyType.STRINGLIST) &&
          (type === PropetyType.STRING || type === PropetyType.STRINGLIST)) ||
        (expected.some((tt) => tt == PropetyType.PROP_ENCODED_ARRAY) &&
          (type === PropetyType.U32 || type === PropetyType.U64));

      if (!typeIsValid) {
        const issue: StandardTypeIssue[] = [];
        expected.forEach((tt) => {
          switch (tt) {
            case PropetyType.EMPTY:
              issue.push(StandardTypeIssue.EXPECTED_EMPTY);
              break;
            case PropetyType.STRING:
              issue.push(StandardTypeIssue.EXPECTED_STRING);
              break;
            case PropetyType.STRINGLIST:
              issue.push(StandardTypeIssue.EXPECTED_STRINGLIST);
              break;
            case PropetyType.U32:
              issue.push(StandardTypeIssue.EXPECTED_U32);
              break;
            case PropetyType.U64:
              issue.push(StandardTypeIssue.EXPECTED_U64);
              break;
            case PropetyType.PROP_ENCODED_ARRAY:
              issue.push(StandardTypeIssue.EXPECTED_PROP_ENCODED_ARRAY);
              break;
          }
        });

        if (issue.length) {
          issues.push(
            genIssue(
              issue,
              ast,
              DiagnosticSeverity.Error,
              [],
              [],
              [property.name]
            )
          );
        }
      }
    };

    if (this.type.length > 1) {
      const type = this.type;
      if (!this.list && this.type.length !== propTypes.length) {
        issues.push(
          genIssue(
            StandardTypeIssue.EXPECTED_COMPOSITE_LENGTH,
            property.ast.values ?? property.ast,
            DiagnosticSeverity.Error,
            [],
            [],
            [propertyName, this.type.length.toString()]
          )
        );
      } else {
        propTypes.forEach((t, i) => {
          if (type[0].types.every((tt) => tt !== t)) {
            // TODO Check
            issues.push(
              genIssue(
                StandardTypeIssue.EXPECTED_STRINGLIST,
                property.ast.values?.values[i] ?? property.ast
              )
            );
          }
        });
      }
    } else {
      if (this.type[0].types.some((tt) => tt === PropetyType.STRINGLIST)) {
        propTypes.some((t) =>
          checkType(
            [PropetyType.STRINGLIST],
            t,
            property.ast.values?.values[0]?.value
          )
        );
      } else if (this.list) {
        propTypes.some((t) =>
          checkType(
            this.type[0].types,
            t,
            property.ast.values?.values[0]?.value
          )
        );
      } else if (
        propTypes.length > 1 &&
        this.type[0].types.some((tt) => tt !== PropetyType.EMPTY)
      ) {
        issues.push(
          genIssue(
            StandardTypeIssue.EXPECTED_ONE,
            property.ast.values ?? property.ast,
            DiagnosticSeverity.Error,
            [],
            [],
            [property.name]
          )
        );
      } else if (propTypes.length === 1) {
        checkType(
          this.type[0].types,
          propTypes[0],
          property.ast.values?.values[0]?.value
        );
      }

      // we have the right type
      if (issues.length === 0) {
        issues.push(...(this.additionalTypeCheck?.(property) ?? []));
        if (
          this.values(property).length &&
          this.type[0].types.some((tt) => tt === PropetyType.STRING)
        ) {
          const currentValue = property.ast.values?.values[0]
            ?.value as StringValue;
          if (
            !this.values(property).some(
              (v) => !!currentValue.value.match(new RegExp(`^["']${v}["']$`))
            )
          ) {
            issues.push(
              genIssue(
                StandardTypeIssue.EXPECTED_ENUM,
                property.ast.values?.values[0]?.value ?? property.ast,
                DiagnosticSeverity.Error,
                [],
                [],
                [
                  this.values(property)
                    .map((v) => `'${v}'`)
                    .join(" or "),
                ]
              )
            );
          }
        }
      }
    }

    return issues;
  }

  validate(runtime: Runtime, node: Node): Issue<StandardTypeIssue>[] {
    if (typeof this.name === "string") {
      const property = node.getProperty(this.name);
      return this.validateProperty(runtime, node, this.name, property);
    }

    const properties = node.properties.filter((p) => this.getNameMatch(p.name));
    return properties.flatMap((p) =>
      this.validateProperty(runtime, node, p.name, p)
    );
  }

  getPropertyCompletionItems(property: Property): CompletionItem[] {
    const currentValue = this.type.at(property.ast.values?.values.length ?? 0);
    if (currentValue?.types.some((tt) => tt === PropetyType.STRING)) {
      if (
        property.ast.values?.values &&
        property.ast.values.values?.length > 1
      ) {
        return [];
      }

      return this.values(property).map((v) => ({
        label: `"${v}"`,
        kind: CompletionItemKind.Variable,
        sortText: v === this.def ? `A${v}` : `Z${v}`,
      }));
    }

    if (
      currentValue?.types.some(
        (tt) => tt === PropetyType.U32 || tt === PropetyType.U64
      )
    ) {
      return this.values(property).map((v) => ({
        label: `<${v}>`,
        kind: CompletionItemKind.Variable,
        sortText: v === this.def ? `A${v}` : `Z${v}`,
      }));
    }

    return [];
  }
}

const propertyValuesToPropetyType = (property: Property): PropetyType[] => {
  return property.ast.values
    ? property.ast.values.values.map((v) => propertyValueToPropetyType(v))
    : [PropetyType.EMPTY];
};

const propertyValueToPropetyType = (
  value: PropertyValue | null
): PropetyType => {
  if (!value) {
    return PropetyType.UNKNOWN;
  }
  if (value.value instanceof StringValue) {
    return PropetyType.STRING;
  }

  if (value.value instanceof ArrayValues) {
    if (value.value.values.length === 1) {
      return PropetyType.U32;
    } else if (value.value.values.length === 2) {
      return PropetyType.U64;
    } else {
      return PropetyType.PROP_ENCODED_ARRAY;
    }
  }

  if (value.value instanceof LabelRef || value.value instanceof NodePathRef) {
    return PropetyType.U32; // TODO Check this
  }

  return PropetyType.BYTESTRING;
};

export class NodeType {
  compatible?: string;
  properties: PropertyNodeType[] = [];
  childNodeTypes: NodeType[] = [];

  constructor(private node: Node) {}

  getIssue(runtime: Runtime) {
    return this.properties.flatMap((p) => p.validate(runtime, this.node));
  }
}
