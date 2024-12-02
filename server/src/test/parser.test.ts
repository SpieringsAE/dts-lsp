/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { Parser } from "../parser";
import fs from "fs";
import { describe, test, jest, expect } from "@jest/globals";
import { SyntaxIssue } from "../types";
import {
  DtcChildNode,
  DtcRefNode,
  DtcRootNode,
  NodeName,
} from "../ast/dtc/node";
import { DtcProperty } from "../ast/dtc/property";
import { resetTokenizedDocmentProvider } from "../providers/tokenizedDocument";
import { LabelRef } from "../ast/dtc/labelRef";

jest.mock("fs", () => ({
  readFileSync: jest.fn().mockImplementation(() => {
    throw new Error("readFileSync - Not mocked");
  }),
}));

const mockReadFileSync = (content: string) => {
  //   (fs.readFileSync as unknown as jest.Mock).mockReset();
  (fs.readFileSync as unknown as jest.Mock).mockImplementation(() => {
    return content;
  });
};
describe("Parser", () => {
  beforeEach(() => {
    resetTokenizedDocmentProvider();
  });

  describe("Missing semicolon", () => {
    test("Root Node", async () => {
      mockReadFileSync("/{}");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].issues).toEqual([SyntaxIssue.END_STATMENT]);
      expect(parser.issues[0].astElement.lastToken.pos).toEqual({
        line: 0,
        col: 2,
        len: 1,
      });
    });

    test("Child Node", async () => {
      mockReadFileSync("/{ node {}};");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].issues).toEqual([SyntaxIssue.END_STATMENT]);
      expect(parser.issues[0].astElement.lastToken.pos).toEqual({
        line: 0,
        col: 9,
        len: 1,
      });
    });

    test("Root and Child Node", async () => {
      mockReadFileSync("/{ node {}}");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(2);
      expect(parser.issues[0].issues).toEqual([SyntaxIssue.END_STATMENT]);
      expect(parser.issues[0].astElement.lastToken.pos).toEqual({
        line: 0,
        col: 9,
        len: 1,
      });

      expect(parser.issues[1].issues).toEqual([SyntaxIssue.END_STATMENT]);
      expect(parser.issues[1].astElement.lastToken.pos).toEqual({
        line: 0,
        col: 10,
        len: 1,
      });
    });

    test("Property no value", async () => {
      mockReadFileSync("/{ prop1 };");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].issues).toEqual([SyntaxIssue.END_STATMENT]);
      expect(parser.issues[0].astElement.lastToken.pos).toEqual({
        line: 0,
        col: 7,
        len: 1,
      });
    });

    test("Property with value", async () => {
      mockReadFileSync("/{ prop1=<10> };");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].issues).toEqual([SyntaxIssue.END_STATMENT]);
      expect(parser.issues[0].astElement.lastToken.pos).toEqual({
        line: 0,
        col: 12,
        len: 1,
      });
    });

    test("Property in node with value", async () => {
      mockReadFileSync("/{ node {prop1=<10>} };");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(2);
      expect(parser.issues[0].issues).toEqual([SyntaxIssue.END_STATMENT]);
      expect(parser.issues[0].astElement.lastToken.pos).toEqual({
        line: 0,
        col: 18,
        len: 1,
      });

      expect(parser.issues[1].issues).toEqual([SyntaxIssue.END_STATMENT]);
      expect(parser.issues[1].astElement.lastToken.pos).toEqual({
        line: 0,
        col: 19,
        len: 1,
      });
    });
  });

  describe("Node syntax", () => {
    test("Empty Root Node", async () => {
      mockReadFileSync("/{};");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(0);
      expect(parser.rootDocument.children.length).toEqual(1);
      expect(
        parser.rootDocument.children[0] instanceof DtcRootNode
      ).toBeTruthy();
      expect(parser.rootDocument.children[0].children.length).toEqual(0);
      expect(parser.rootDocument.children[0].firstToken.pos).toEqual({
        line: 0,
        col: 0,
        len: 1,
      });
      expect(parser.rootDocument.children[0].lastToken.pos).toEqual({
        line: 0,
        col: 3,
        len: 1,
      });
    });

    test("Root Node with properties", async () => {
      mockReadFileSync("/{prop1; prop2=<10>;};");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(0);
      expect(parser.rootDocument.children.length).toEqual(1);
      const rootDtc = parser.rootDocument.children[0];
      expect(rootDtc instanceof DtcRootNode).toBeTruthy();
      expect(parser.rootDocument.children[0].children.length).toEqual(2);

      // Root DTC
      expect(rootDtc.firstToken.pos.col).toEqual(0);
      expect(rootDtc.lastToken.pos.col).toEqual(21);

      // Prop1
      const prop1 = rootDtc.children[0];
      expect(prop1 instanceof DtcProperty).toBeTruthy();
      expect(prop1.firstToken.pos.col).toEqual(2);
      expect(prop1.lastToken.pos.col).toEqual(7);

      // Prop2
      const prop2 = rootDtc.children[1];
      expect(prop2 instanceof DtcProperty).toBeTruthy();
      expect(prop2.firstToken.pos.col).toEqual(9);
      expect(prop2.lastToken.pos.col).toEqual(19);
    });

    test("Root Node with nested nodes", async () => {
      mockReadFileSync("/{node1{}; node2{};};");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(0);
      expect(parser.rootDocument.children.length).toEqual(1);
      const rootDtc = parser.rootDocument.children[0];
      expect(rootDtc instanceof DtcRootNode).toBeTruthy();
      expect(parser.rootDocument.children[0].children.length).toEqual(2);

      // Root DTC
      expect(rootDtc.firstToken.pos.col).toEqual(0);
      expect(rootDtc.lastToken.pos.col).toEqual(20);

      // node1
      const node1 = rootDtc.children[0];
      expect(node1 instanceof DtcChildNode).toBeTruthy();
      expect(node1.firstToken.pos.col).toEqual(2);
      expect(node1.lastToken.pos.col).toEqual(9);

      // Prop2
      const node2 = rootDtc.children[1];
      expect(node2 instanceof DtcChildNode).toBeTruthy();
      expect(node2.firstToken.pos.col).toEqual(11);
      expect(node2.lastToken.pos.col).toEqual(18);
    });

    test("Ref Node", async () => {
      mockReadFileSync("&label{};");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(0);
      expect(parser.rootDocument.children.length).toEqual(1);
      expect(
        parser.rootDocument.children[0] instanceof DtcRefNode
      ).toBeTruthy();
      expect(
        parser.rootDocument.children[0].children[0] instanceof LabelRef
      ).toBeTruthy();
      expect(
        (parser.rootDocument.children[0].children[0] as LabelRef).value
      ).toBe("label");
      expect(parser.rootDocument.children[0].firstToken.pos).toEqual({
        line: 0,
        col: 0,
        len: 1,
      });
      expect(parser.rootDocument.children[0].lastToken.pos).toEqual({
        line: 0,
        col: 8,
        len: 1,
      });
    });

    test("Child node, no address", async () => {
      mockReadFileSync("/{node1{};};");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(0);
      expect(parser.rootDocument.children.length).toEqual(1);
      const rootDtc = parser.rootDocument.children[0];

      const node1 = rootDtc.children[0];
      expect(node1 instanceof DtcChildNode).toBeTruthy();
      expect(node1.children[0] instanceof NodeName).toBeTruthy();
      expect((node1.children[0] as NodeName).name).toBe("node1");
      expect((node1.children[0] as NodeName).address).toBeUndefined();
      expect(node1.firstToken.pos.col).toEqual(2);
      expect(node1.lastToken.pos.col).toEqual(9);
    });

    test("Child node, with address", async () => {
      mockReadFileSync("/{node1@20{};};");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(0);
      expect(parser.rootDocument.children.length).toEqual(1);
      const rootDtc = parser.rootDocument.children[0];

      const node1 = rootDtc.children[0];
      expect(node1 instanceof DtcChildNode).toBeTruthy();
      expect(node1.children[0] instanceof NodeName).toBeTruthy();
      expect((node1.children[0] as NodeName).name).toBe("node1");
      expect((node1.children[0] as NodeName).address).toBe(0x20);
      expect(node1.firstToken.pos.col).toEqual(2);
      expect(node1.lastToken.pos.col).toEqual(12);
    });

    test("Child node, missing address", async () => {
      mockReadFileSync("/{node1@{};};");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].issues).toEqual([SyntaxIssue.NODE_ADDRESS]);
      expect(parser.issues[0].astElement.lastToken.pos).toEqual({
        line: 0,
        col: 6,
        len: 1,
      });
    });

    test("Child node, whitespce between address", async () => {
      mockReadFileSync("/{node1@ 20{};};");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].issues).toEqual([
        SyntaxIssue.NODE_NAME_ADDRESS_WHITE_SPACE,
      ]);
      expect(parser.issues[0].astElement.firstToken.pos).toEqual({
        line: 0,
        col: 7,
        len: 1,
      });
      expect(parser.issues[0].astElement.lastToken.pos).toEqual({
        line: 0,
        col: 9,
        len: 2,
      });

      const rootDtc = parser.rootDocument.children[0];
      const node1 = rootDtc.children[0];
      expect(node1 instanceof DtcChildNode).toBeTruthy();
      expect(node1.children[0] instanceof NodeName).toBeTruthy();
      expect((node1.children[0] as NodeName).name).toBe("node1");
      expect((node1.children[0] as NodeName).address).toBe(0x20);
      expect(node1.firstToken.pos.col).toEqual(2);
      expect(node1.lastToken.pos.col).toEqual(13);
    });

    test("Child node, whitespce between name", async () => {
      mockReadFileSync("/{node1 @20{};};");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].issues).toEqual([
        SyntaxIssue.NODE_NAME_ADDRESS_WHITE_SPACE,
      ]);
      expect(parser.issues[0].astElement.firstToken.pos.col).toEqual(2);
      expect(parser.issues[0].astElement.lastToken.pos.col).toEqual(8);

      const rootDtc = parser.rootDocument.children[0];
      const node1 = rootDtc.children[0];
      expect(node1 instanceof DtcChildNode).toBeTruthy();
      expect(node1.children[0] instanceof NodeName).toBeTruthy();
      expect((node1.children[0] as NodeName).name).toBe("node1");
      expect((node1.children[0] as NodeName).address).toBe(0x20);
      expect(node1.firstToken.pos.col).toEqual(2);
      expect(node1.lastToken.pos.col).toEqual(13);
    });
  });
});
