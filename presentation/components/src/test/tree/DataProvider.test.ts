/*---------------------------------------------------------------------------------------------
* Copyright (c) 2018 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import "@bentley/presentation-frontend/lib/test/_helpers/MockFrontendEnvironment";
import { expect } from "chai";
import * as faker from "faker";
import * as moq from "@bentley/presentation-common/lib/test/_helpers/Mocks";
import { PromiseContainer } from "@bentley/presentation-common/lib/test/_helpers/Promises";
import { createRandomECInstanceNodeKey, createRandomECInstanceNode, createRandomNodePathElement } from "@bentley/presentation-common/lib/test/_helpers/random";
import { createRandomTreeNodeItem } from "../_helpers/UiComponents";
import { IModelConnection } from "@bentley/imodeljs-frontend";
import { Node } from "@bentley/presentation-common";
import { Presentation } from "@bentley/presentation-frontend";
import PresentationManager from "@bentley/presentation-frontend/lib/PresentationManager";
import { PageOptions } from "@bentley/ui-components";
import PresentationTreeDataProvider from "../../tree/DataProvider";
import { pageOptionsUiToPresentation } from "../../tree/Utils";

describe("TreeDataProvider", () => {

  let rulesetId: string;
  let provider: PresentationTreeDataProvider;
  const presentationManagerMock = moq.Mock.ofType<PresentationManager>();
  const imodelMock = moq.Mock.ofType<IModelConnection>();
  before(() => {
    rulesetId = faker.random.word();
    Presentation.presentation = presentationManagerMock.object;
  });
  beforeEach(() => {
    presentationManagerMock.reset();
    provider = new PresentationTreeDataProvider(imodelMock.object, rulesetId);
  });

  describe("rulesetId", () => {

    it("returns rulesetId provider is initialized with", () => {
      expect(provider.rulesetId).to.eq(rulesetId);
    });

  });

  describe("connection", () => {

    it("returns connection provider is initialized with", () => {
      expect(provider.connection).to.eq(imodelMock.object);
    });

  });

  describe("getNodesCount", () => {

    describe("root", () => {

      it("returns presentation manager result", async () => {
        const result = faker.random.number();
        presentationManagerMock
          .setup((x) => x.getRootNodesCount({ imodel: imodelMock.object, rulesetId }))
          .returns(async () => result)
          .verifiable();
        const actualResult = await provider.getNodesCount();
        expect(actualResult).to.eq(result);
        presentationManagerMock.verifyAll();
      });

      it("memoizes result", async () => {
        const resultContainers = [new PromiseContainer<number>(), new PromiseContainer<number>()];
        presentationManagerMock
          .setup((x) => x.getRootNodesCount({ imodel: imodelMock.object, rulesetId }))
          .returns(() => resultContainers[0].promise);
        presentationManagerMock
          .setup((x) => x.getRootNodesCount({ imodel: imodelMock.object, rulesetId }))
          .returns(() => resultContainers[1].promise);
        const promises = [provider.getNodesCount(), provider.getNodesCount()];
        resultContainers.forEach((c: PromiseContainer<number>, index: number) => c.resolve(index));
        const results = await Promise.all(promises);
        expect(results[1]).to.eq(results[0]).to.eq(0);
        presentationManagerMock.verify((x) => x.getRootNodesCount({ imodel: imodelMock.object, rulesetId }), moq.Times.once());
      });

    });

    describe("children", () => {

      it("returns presentation manager result", async () => {
        const parentKey = createRandomECInstanceNodeKey();
        const parentNode = createRandomTreeNodeItem(parentKey);
        const result = faker.random.number();
        presentationManagerMock
          .setup((x) => x.getChildrenCount({ imodel: imodelMock.object, rulesetId }, parentKey))
          .returns(async () => result)
          .verifiable();
        const actualResult = await provider.getNodesCount(parentNode);
        expect(actualResult).to.eq(result);
        presentationManagerMock.verifyAll();
      });

      it("memoizes result", async () => {
        const parentKeys = [createRandomECInstanceNodeKey(), createRandomECInstanceNodeKey()];
        const parentNodes = parentKeys.map((key) => createRandomTreeNodeItem(key));
        const resultContainers = [new PromiseContainer<number>(), new PromiseContainer<number>()];

        presentationManagerMock
          .setup((x) => x.getChildrenCount({ imodel: imodelMock.object, rulesetId }, parentKeys[0]))
          .returns(() => resultContainers[0].promise)
          .verifiable(moq.Times.once());
        presentationManagerMock
          .setup((x) => x.getChildrenCount({ imodel: imodelMock.object, rulesetId }, parentKeys[1]))
          .returns(() => resultContainers[1].promise)
          .verifiable(moq.Times.once());

        const promises = [
          provider.getNodesCount(parentNodes[0]),
          provider.getNodesCount(parentNodes[1]),
          provider.getNodesCount(parentNodes[0]),
        ];
        resultContainers.forEach((c: PromiseContainer<number>, index: number) => c.resolve(index));
        const results = await Promise.all(promises);
        expect(results[0]).to.eq(results[2]).to.eq(0);
        expect(results[1]).to.eq(1);

        presentationManagerMock.verifyAll();
      });

    });

  });

  describe("getNodes", () => {

    describe("root", () => {

      it("returns presentation manager result", async () => {
        const pageOptions: PageOptions = { start: faker.random.number(), size: faker.random.number() };
        const result = [createRandomECInstanceNode(), createRandomECInstanceNode()];
        presentationManagerMock
          .setup((x) => x.getRootNodes({ imodel: imodelMock.object, rulesetId, paging: pageOptionsUiToPresentation(pageOptions) }))
          .returns(async () => result)
          .verifiable();
        const actualResult = await provider.getNodes(undefined, pageOptions);
        expect(actualResult).to.matchSnapshot();
        presentationManagerMock.verifyAll();
      });

      it("memoizes result", async () => {
        const resultContainers = [new PromiseContainer<Node[]>(), new PromiseContainer<Node[]>(), new PromiseContainer<Node[]>()];
        presentationManagerMock
          .setup((x) => x.getRootNodes({ imodel: imodelMock.object, rulesetId, paging: undefined }))
          .returns(() => resultContainers[0].promise)
          .verifiable(moq.Times.once());
        presentationManagerMock
          .setup((x) => x.getRootNodes({ imodel: imodelMock.object, rulesetId, paging: { start: 0, size: 0 } }))
          .verifiable(moq.Times.never());
        presentationManagerMock
          .setup((x) => x.getRootNodes({ imodel: imodelMock.object, rulesetId, paging: { start: 1, size: 0 } }))
          .returns(() => resultContainers[1].promise)
          .verifiable(moq.Times.once());
        presentationManagerMock
          .setup((x) => x.getRootNodes({ imodel: imodelMock.object, rulesetId, paging: { start: 0, size: 1 } }))
          .returns(() => resultContainers[2].promise)
          .verifiable(moq.Times.once());

        const promises = [
          provider.getNodes(undefined, undefined), provider.getNodes(undefined, undefined),
          provider.getNodes(undefined, { start: 0, size: 0 }), provider.getNodes(undefined, { start: 0, size: 0 }),
          provider.getNodes(undefined, { start: 1, size: 0 }), provider.getNodes(undefined, { start: 1, size: 0 }),
          provider.getNodes(undefined, { start: 0, size: 1 }), provider.getNodes(undefined, { start: 0, size: 1 }),
        ];
        resultContainers.forEach((c: PromiseContainer<Node[]>) => c.resolve([createRandomECInstanceNode()]));
        const results = await Promise.all(promises);

        expect(results[0]).to.eq(results[1], "results[0] should eq results[1]");
        expect(results[2])
          .to.eq(results[3], "results[2] should eq results[3]")
          .to.eq(results[0], "both results[2] and results[3] should eq results[0]");
        expect(results[4]).to.eq(results[5], "results[4] should eq results[5]");
        expect(results[6]).to.eq(results[7], "results[6] should eq results[7]");

        presentationManagerMock.verifyAll();
      });

    });

    describe("children", () => {

      it("returns presentation manager result", async () => {
        const parentKey = createRandomECInstanceNodeKey();
        const parentNode = createRandomTreeNodeItem(parentKey);
        const pageOptions: PageOptions = { start: faker.random.number(), size: faker.random.number() };
        presentationManagerMock
          .setup((x) => x.getChildren({ imodel: imodelMock.object, rulesetId, paging: pageOptionsUiToPresentation(pageOptions) }, parentKey))
          .returns(async () => [createRandomECInstanceNode(), createRandomECInstanceNode()])
          .verifiable();
        const actualResult = await provider.getNodes(parentNode, pageOptions);
        expect(actualResult).to.matchSnapshot();
        presentationManagerMock.verifyAll();
      });

      it("memoizes result", async () => {
        const parentKeys = [createRandomECInstanceNodeKey(), createRandomECInstanceNodeKey()];
        const parentNodes = parentKeys.map((key) => createRandomTreeNodeItem(key));
        const resultContainers = [new PromiseContainer<Node[]>(), new PromiseContainer<Node[]>(), new PromiseContainer<Node[]>()];

        presentationManagerMock
          .setup((x) => x.getChildren({ imodel: imodelMock.object, rulesetId, paging: undefined }, parentKeys[0]))
          .returns(() => resultContainers[0].promise)
          .verifiable(moq.Times.once());
        presentationManagerMock
          .setup((x) => x.getChildren({ imodel: imodelMock.object, rulesetId, paging: { start: 0, size: 0 } }, parentKeys[0]))
          .verifiable(moq.Times.never());
        presentationManagerMock
          .setup((x) => x.getChildren({ imodel: imodelMock.object, rulesetId, paging: { start: 1, size: 0 } }, parentKeys[0]))
          .returns(() => resultContainers[1].promise)
          .verifiable(moq.Times.once());
        presentationManagerMock
          .setup((x) => x.getChildren({ imodel: imodelMock.object, rulesetId, paging: undefined }, parentKeys[1]))
          .returns(() => resultContainers[2].promise)
          .verifiable(moq.Times.once());

        const promises = [
          provider.getNodes(parentNodes[0], undefined), provider.getNodes(parentNodes[0], undefined),
          provider.getNodes(parentNodes[0], { start: 0, size: 0 }), provider.getNodes(parentNodes[0], { start: 0, size: 0 }),
          provider.getNodes(parentNodes[0], { start: 1, size: 0 }), provider.getNodes(parentNodes[0], { start: 1, size: 0 }),
          provider.getNodes(parentNodes[1], undefined), provider.getNodes(parentNodes[1], undefined),
        ];
        resultContainers.forEach((c: PromiseContainer<Node[]>) => c.resolve([createRandomECInstanceNode()]));
        const results = await Promise.all(promises);

        expect(results[0]).to.eq(results[1], "results[0] should eq results[1]");
        expect(results[2])
          .to.eq(results[3], "results[2] should eq results[3]")
          .to.eq(results[0], "both results[2] and results[3] should eq results[0]");
        expect(results[4]).to.eq(results[5], "results[4] should eq results[5]");
        expect(results[6]).to.eq(results[7], "results[6] should eq results[7]");

        presentationManagerMock.verifyAll();
      });

    });

  });

  describe("getFilteredNodes", () => {

    it("returns presentation manager result", async () => {
      const filter = faker.random.word();
      presentationManagerMock
        .setup((x) => x.getFilteredNodePaths({ imodel: imodelMock.object, rulesetId }, filter))
        .returns(async () => [createRandomNodePathElement(), createRandomNodePathElement()])
        .verifiable();
      const actualResult = await provider.getFilteredNodePaths(filter);
      expect(actualResult).to.matchSnapshot();
      presentationManagerMock.verifyAll();
    });

  });

});
