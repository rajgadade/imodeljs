/*---------------------------------------------------------------------------------------------
* Copyright (c) 2018 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import * as path from "path";
import { assert } from "chai";
import { OpenMode, ActivityLoggingContext, GuidString, PerfLogger } from "@bentley/bentleyjs-core";
import { AccessToken, Config } from "@bentley/imodeljs-clients";
import { IModel, IModelVersion } from "@bentley/imodeljs-common";
import { IModelDb, OpenParams, IModelHost, IModelHostConfiguration, PhysicalModel } from "../../backend";
import { IModelTestUtils, TestUsers } from "../IModelTestUtils";
import { HubUtility } from "./HubUtility";
import { IModelJsFs } from "../../IModelJsFs";
import { BriefcaseManager } from "../../BriefcaseManager";
import { Logger, LogLevel } from "@bentley/bentleyjs-core";

// Useful utilities to download/upload test cases from/to the iModel Hub
describe.skip("DebugHubIssues (#integration)", () => {
  let accessToken: AccessToken;
  const iModelRootDir = "d:\\temp\\IModelDumps\\";
  const actx = new ActivityLoggingContext("");

  before(async () => {
    accessToken = await HubUtility.login(TestUsers.manager);

    Logger.initializeToConsole();
    Logger.setLevelDefault(LogLevel.Warning);
    // Logger.setLevel("Performance", LogLevel.Info);
    // Logger.setLevel("imodeljs-backend.BriefcaseManager", LogLevel.Trace);
    // Logger.setLevel("imodeljs-backend.OpenIModelDb", LogLevel.Trace);
    // Logger.setLevel("imodeljs-clients.Clients", LogLevel.Trace);
    // Logger.setLevel("imodeljs-clients.imodelhub", LogLevel.Trace);
    // Logger.setLevel("imodeljs-clients.Url", LogLevel.Trace);
  });

  it.skip("should be able to upload required test files to the Hub", async () => {
    const projectName = "iModelJsIntegrationTest";

    let iModelName = "ReadOnlyTest";
    let iModelDir = path.join(iModelRootDir, iModelName);
    await HubUtility.pushIModelAndChangeSets(accessToken, projectName, iModelDir);

    iModelName = "ReadWriteTest";
    iModelDir = path.join(iModelRootDir, iModelName);
    await HubUtility.pushIModelAndChangeSets(accessToken, projectName, iModelDir);

    iModelName = "NoVersionsTest";
    iModelDir = path.join(iModelRootDir, iModelName);
    await HubUtility.pushIModelAndChangeSets(accessToken, projectName, iModelDir);

    iModelName = "ConnectionReadTest";
    iModelDir = path.join(iModelRootDir, iModelName);
    await HubUtility.pushIModelAndChangeSets(accessToken, projectName, iModelDir);
  });

  it.skip("should be able to download and backup required test files from the Hub", async () => {
    const projectName = "iModelJsIntegrationTest";

    let iModelName = "ReadOnlyTest";
    let iModelDir = path.join(iModelRootDir, iModelName);
    await HubUtility.downloadIModelByName(accessToken, projectName, iModelName, iModelDir);

    iModelName = "ReadWriteTest";
    iModelDir = path.join(iModelRootDir, iModelName);
    await HubUtility.downloadIModelByName(accessToken, projectName, iModelName, iModelDir);

    iModelName = "NoVersionsTest";
    iModelDir = path.join(iModelRootDir, iModelName);
    await HubUtility.downloadIModelByName(accessToken, projectName, iModelName, iModelDir);

    iModelName = "ConnectionReadTest";
    iModelDir = path.join(iModelRootDir, iModelName);
    await HubUtility.downloadIModelByName(accessToken, projectName, iModelName, iModelDir);
  });

  it.skip("should be able to open ReadOnlyTest model", async () => {
    const projectName = "iModelJsTest";
    const iModelName = "ReadOnlyTest";

    const myProjectId = await HubUtility.queryProjectIdByName(accessToken, projectName);
    const myIModelId = await HubUtility.queryIModelIdByName(accessToken, myProjectId, iModelName);

    const iModel: IModelDb = await IModelDb.open(actx, accessToken, myProjectId, myIModelId.toString(), OpenParams.fixedVersion());
    assert.exists(iModel);
    assert(iModel.openParams.openMode === OpenMode.Readonly);

    await iModel.close(actx, accessToken);
  });

  it.skip("should be able to validate change set operations", async () => {
    const projectName = "iModelJsTest";
    const iModelName = "ReadOnlyTest";
    const myProjectId = await HubUtility.queryProjectIdByName(accessToken, projectName);
    const myIModelId = await HubUtility.queryIModelIdByName(accessToken, myProjectId, iModelName);

    const link = `https://connect-imodelweb.bentley.com/imodeljs/?projectId=${myProjectId}&iModelId=${myIModelId}`;
    console.log(`ProjectName: ${projectName}, iModelName: ${iModelName}, URL Link: ${link}`); // tslint:disable-line:no-console

    const iModelDir = path.join(iModelRootDir, iModelName);
    await HubUtility.validateAllChangeSetOperations(accessToken, myProjectId, myIModelId, iModelDir);
  });

  it.skip("should be able to download the seed files, change sets, for UKRail_EWR2 (EWR_2E) model", async () => {
    const projectName = "UKRail_EWR2";
    const iModelName = "EWR_2E";

    const iModelDir = path.join(iModelRootDir, iModelName);
    await HubUtility.downloadIModelByName(accessToken, projectName, iModelName, iModelDir);
  });

  it.skip("should be able to download the seed files, change sets, for 1MWCCN01 - North Project (SECTION_08_IM01) model", async () => {
    const projectName = "1MWCCN01 - North Project";
    const iModelName = "SECTION_08_IM01";

    const iModelDir = path.join(iModelRootDir, iModelName);
    await HubUtility.downloadIModelByName(accessToken, projectName, iModelName, iModelDir);
  });

  it.skip("should be able to open UKRail_EWR2 (EWR_2E) model", async () => {
    const projectName = "UKRail_EWR2";
    const iModelName = "EWR_2E";

    const myProjectId = await HubUtility.queryProjectIdByName(accessToken, projectName);
    const myIModelId = await HubUtility.queryIModelIdByName(accessToken, myProjectId, iModelName);

    const perfLogger = new PerfLogger("EWR_2E");

    const iModel: IModelDb = await IModelDb.open(actx, accessToken, myProjectId, myIModelId.toString(), OpenParams.fixedVersion());
    assert.exists(iModel);
    assert(iModel.openParams.openMode === OpenMode.Readonly);

    perfLogger.dispose();

    await iModel.close(actx, accessToken);
  });

  it.skip("should be able to open 1MWCCN01 - North Project (SECTION_08_IM01) model", async () => {
    const projectName = "1MWCCN01 - North Project";
    const iModelName = "SECTION_08_IM01";

    const myProjectId = await HubUtility.queryProjectIdByName(accessToken, projectName);
    const myIModelId = await HubUtility.queryIModelIdByName(accessToken, myProjectId, iModelName);

    const perfLogger = new PerfLogger("SECTION_08_IM01");

    const iModel: IModelDb = await IModelDb.open(actx, accessToken, myProjectId, myIModelId.toString(), OpenParams.fixedVersion());
    assert.exists(iModel);
    assert(iModel.openParams.openMode === OpenMode.Readonly);

    perfLogger.dispose();

    await iModel.close(actx, accessToken);
  });

  it.skip("create a test case on the Hub with a named version from a standalone iModel", async () => {
    const projectName = "NodeJsTestProject";
    const pathname = "d:\\temp\\IModelDumps\\Office Building4.bim";

    // Push the iModel to the Hub
    const projectId = await HubUtility.queryProjectIdByName(accessToken, projectName);
    const iModelId: GuidString = await HubUtility.pushIModel(accessToken, projectId, pathname);

    const iModelDb = await IModelDb.open(actx, accessToken, projectId, iModelId.toString(), OpenParams.pullAndPush(), IModelVersion.latest());
    assert(!!iModelDb);

    // Create and upload a dummy change set to the Hub
    const modelId = PhysicalModel.insert(iModelDb, IModel.rootSubjectId, "DummyTestModel");
    assert(!!modelId);
    iModelDb.saveChanges("Dummy change set");
    await iModelDb.pushChanges(actx, accessToken!);

    // Create a named version on the just uploaded change set
    const changeSetId: string = await IModelVersion.latest().evaluateChangeSet(actx, accessToken, iModelId.toString(), BriefcaseManager.imodelClient);
    await BriefcaseManager.imodelClient.versions.create(actx, accessToken, iModelId, changeSetId, "DummyVersion", "Just a dummy version for testing with web navigator");
  });

  it.skip("should be able to delete any iModel on the Hub", async () => {
    await HubUtility.deleteIModel(accessToken, "NodeJsTestProject", "TestModel");
  });

  it.skip("should be able to open any iModel on the Hub", async () => {
    const projectName = "NodeJsTestProject";
    const iModelName = "TestModel";

    const myProjectId = await HubUtility.queryProjectIdByName(accessToken, projectName);
    const myIModelId = await HubUtility.queryIModelIdByName(accessToken, myProjectId, iModelName);

    const iModel: IModelDb = await IModelDb.open(actx, accessToken, myProjectId, myIModelId.toString(), OpenParams.fixedVersion());
    assert.exists(iModel);
    assert(iModel.openParams.openMode === OpenMode.Readonly);

    await iModel.close(actx, accessToken);
  });

  it.skip("should be able to create a change set from a standalone iModel)", async () => {
    const dbName = "D:\\temp\\Defects\\879278\\DPIntegrationTestProj79.bim";
    const iModel: IModelDb = IModelDb.openStandalone(dbName, OpenMode.ReadWrite, true); // could throw Error
    assert.exists(iModel);

    const changeSetToken = BriefcaseManager.createStandaloneChangeSet(iModel.briefcase);
    assert(IModelJsFs.existsSync(changeSetToken.pathname));

    BriefcaseManager.dumpChangeSet(iModel.briefcase, changeSetToken);
  });

  it.skip("should be able to open any iModel on the Hub", async () => {
    const projectName = "AbdTestProject";
    const iModelName = "ATP_2018050310145994_scenario22";

    const myProjectId = await HubUtility.queryProjectIdByName(accessToken, projectName);
    const myIModelId = await HubUtility.queryIModelIdByName(accessToken, myProjectId, iModelName);

    const iModel: IModelDb = await IModelDb.open(actx, accessToken, myProjectId, myIModelId.toString(), OpenParams.fixedVersion());
    assert.exists(iModel);
    assert(iModel.openParams.openMode === OpenMode.Readonly);

    await iModel.close(actx, accessToken);
  });

  it.skip("should be able to download the seed files, change sets, for any iModel on the Hub in PROD", async () => {
    if (Config.App.getNumber("imjs_buddi_resolve_url_using_region") !== 0) {
      assert.fail("this test require production environment");
    }

    const accessToken1: AccessToken = await IModelTestUtils.getTestUserAccessToken(TestUsers.regular);

    // Restart host on PROD
    IModelHost.shutdown();
    const hostConfig: IModelHostConfiguration = new IModelHostConfiguration();
    IModelHost.startup(hostConfig);

    const projectName = "1MWCCN01 - North Project";
    const iModelName = "1MWCCN01";

    const iModelDir = path.join(iModelRootDir, iModelName);
    await HubUtility.downloadIModelByName(accessToken1, projectName, iModelName, iModelDir);
  });

  it.skip("should be able to download the seed files, change sets, for any iModel on the Hub in DEV", async () => {
    const accessToken1: AccessToken = await IModelTestUtils.getTestUserAccessToken(TestUsers.user1);

    // Restart host on DEV
    IModelHost.shutdown();
    const hostConfig: IModelHostConfiguration = new IModelHostConfiguration();
    IModelHost.startup(hostConfig);
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // Turn off SSL validation in DEV

    const projectId = "bffa4aea-5f3f-4b60-8ecb-4656081ea480";
    const iModelId = "5e8f5fbb-6613-479a-afb1-ce8de037ef0e";
    const iModelDir = path.join(iModelRootDir, iModelId);

    const startTime = Date.now();
    await HubUtility.downloadIModelById(accessToken1, projectId, iModelId, iModelDir);
    const finishTime = Date.now();
    console.log(`Time taken to download is ${finishTime - startTime} milliseconds`); // tslint:disable-line:no-console
  });

});
