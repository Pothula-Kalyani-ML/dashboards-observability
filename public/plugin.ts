/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import './index.scss';

import { AppMountParameters, CoreSetup, CoreStart, Plugin } from '../../../src/core/public';
import {
  observabilityApplicationsID,
  observabilityApplicationsPluginOrder,
  observabilityApplicationsTitle,
  observabilityEventsID,
  observabilityEventsPluginOrder,
  observabilityEventsTitle,
  observabilityID,
  observabilityMetricsID,
  observabilityMetricsPluginOrder,
  observabilityMetricsTitle, observabilityNotebooksID, observabilityNotebooksPluginOrder, observabilityNotebooksTitle,
  observabilityOperationalPanelsID, observabilityOperationalPanelsPluginOrder, observabilityOperationalPanelsTitle,
  observabilityPluginOrder,
  observabilityTitle,
  observabilityTraceAnalyticsID,
  observabilityTraceAnalyticsPluginOrder,
  observabilityTraceAnalyticsTitle,
} from '../common/constants/shared';
import PPLService from './services/requests/ppl';
import DSLService from './services/requests/dsl';
import TimestampUtils from './services/timestamp/timestamp';
import SavedObjects from './services/saved_objects/event_analytics/saved_objects';
import { AppPluginStartDependencies, ObservabilitySetup, ObservabilityStart } from './types';
import { convertLegacyNotebooksUrl } from './components/notebooks/components/helpers/legacy_route_helpers';
import { convertLegacyTraceAnalyticsUrl } from './components/trace_analytics/components/common/legacy_route_helpers';
import { uiSettingsService } from '../common/utils';
import { DashboardCreatorFn } from '../../../src/plugins/opensearch_dashboards_react/public/context/types';
import { fetchPanelsList } from './components/custom_panels/helpers/utils';
import { fetchAppsList } from './components/application_analytics/helpers/utils';
import { QueryManager } from '../common/query_manager';
import { DashboardSetup } from '../../../src/plugins/dashboard/public';
import { DashboardListItem } from '../../../src/plugins/dashboard/common/types';
import { concat, from } from 'rxjs';
import { catchError, map, mergeMap } from 'rxjs/operators';

export class ObservabilityPlugin implements Plugin<ObservabilitySetup, ObservabilityStart> {
  constructor(private initializerContext: PluginInitializerContext) {}

  public setup(core: CoreSetup, { dashboard }: { dashboard: DashboardSetup }): ObservabilitySetup {
    uiSettingsService.init(core.uiSettings, core.notifications);

    // redirect legacy notebooks URL to current URL under observability
    if (window.location.pathname.includes('notebooks-dashboards')) {
      window.location.assign(convertLegacyNotebooksUrl(window.location));
    }

    // redirect legacy trace analytics URL to current URL under observability
    if (window.location.pathname.includes('trace-analytics-dashboards')) {
      window.location.assign(convertLegacyTraceAnalyticsUrl(window.location));
    }

    // Fetches all saved Applications
    const fetchApplicationAnalytics = () => {
      return from(fetchAppsList(core.http)).pipe(
        map(convertAppAnalyticToDashboardListItem),
        catchError((err) => {
          console.error('Issue in fetching the app analytics list', err);
          return from([]);
        })
      );
    };

    // Fetches all saved Custom Panels
    const fetchObservabilityPanels = () => {
      return from(fetchPanelsList(core.http)).pipe(
        mergeMap((item) => item),
        map(convertPanelToDashboardListItem),
        catchError((err) => {
          console.error('Issue in fetching the operational panels', err);
          return from([]);
        })
      );
    };

    const convertPanelToDashboardListItem = (item: any): DashboardListItem => {
      return {
        id: item.id,
        title: item.name,
        type: 'Observability Panel',
        description: '...',
        url: `observability-applications#/operational_panels/${item.id}`,
        listType: 'observabiliity-panel',
      };
    };

    const convertAppAnalyticToDashboardListItem = (item: any): DashboardListItem => {
      return {
        id: item.id,
        title: item.name,
        type: 'Observability Application',
        description: item.description,
        url: `observability-applications#/application_analytics/${item.id}`,
        listType: 'observability-application',
      };
    };

    const id: string = this.initializerContext.opaqueId.description!;

    const dashboardAppAnalytics = fetchApplicationAnalytics();
    const dashboardObservabilityPanels = fetchObservabilityPanels();
    const combinedDashboardList = concat(dashboardAppAnalytics, dashboardObservabilityPanels);

    const createAppAnalytics: DashboardCreatorFn = () => {
      window.location = core.http.basePath.prepend(
        '/app/observability-dashboards#/application_analytics/create'
      );
    };

    const createNotebook: DashboardCreatorFn = () => {
      window.location = core.http.basePath.prepend(
        '/app/observability-dashboards#/notebooks/create'
      );
    };

    const createPanel: DashboardCreatorFn = () => {
      window.location = core.http.basePath.prepend(
        '/app/observability-dashboards#/operational_panels/create'
      );
    };

    dashboard.registerDashboardListSource(id, () => combinedDashboardList);

    dashboard.registerDashboardItemCreator({
      id: 'observaility-notebook',
      defaultText: 'Notebook',
      creatorFn: createNotebook,
    });

    dashboard.registerDashboardItemCreator({
      id: 'observaility-application',
      defaultText: 'Observability App',
      creatorFn: createAppAnalytics,
    });

    dashboard.registerDashboardItemCreator({
      id: 'observaility-panel',
      defaultText: 'Operational Panel',
      creatorFn: createPanel,
    });

    const appMountWithStartPage = (startPage?: string) => async (params: AppMountParameters) => {
      const { Observability } = await import('./components/index');
      const [coreStart, depsStart] = await core.getStartServices();
      const pplService = new PPLService(coreStart.http);
      const dslService = new DSLService(coreStart.http);
      const savedObjects = new SavedObjects(coreStart.http);
      const timestampUtils = new TimestampUtils(dslService);
      const qm = new QueryManager();

      return Observability(
        coreStart,
        depsStart as AppPluginStartDependencies,
        params,
        pplService,
        dslService,
        savedObjects,
        timestampUtils,
        qm,
        startPage
      );
    };

    core.application.register({
      id: observabilityApplicationsID,
      title: observabilityApplicationsTitle,
      category: customCategory,
      order: observabilityApplicationsPluginOrder,
      mount: appMountWithStartPage('/application_analytics'),
      appRoute: "/app/observability-dashboards#/application_analytics",
      defaultPath: "/",
    });

    core.application.register({
      id: observabilityTraceAnalyticsID,
      title: observabilityTraceAnalyticsTitle,
      category: customCategory,
      order: observabilityTraceAnalyticsPluginOrder,
      mount: appMountWithStartPage('/trace_analytics'),
      appRoute: "/app/observability-dashboards#/trace_analytics",
      defaultPath: "/home",
    });

    core.application.register({
      id: observabilityEventsID,
      title: observabilityEventsTitle,
      category: customCategory,
      order: observabilityEventsPluginOrder,
      mount: appMountWithStartPage('/event_analytics'),
      appRoute: "/app/observability-dashboards#/event_analytics",
      defaultPath: "/",
    });

    core.application.register({
      id: observabilityID,
      title: observabilityMetricsTitle,
      category: customCategory,
      order: observabilityMetricsPluginOrder,
      mount: appMountWithStartPage('/metrics_analytics'),
      appRoute: "/app/observability-dashboards#/metrics_analytics",
      defaultPath: "/",
    });

    core.application.register({
      id: observabilityOperationalPanelsID,
      title: observabilityOperationalPanelsTitle,
      category: customCategory,
      order: observabilityOperationalPanelsPluginOrder,
      mount: appMountWithStartPage('/operational_panels'),
      appRoute: "/app/observability-dashboards#/operational_panels",
      defaultPath: "/",
    });

    core.application.register({
      id: observabilityNotebooksID,
      title: observabilityNotebooksTitle,
      category: customCategory,
      order: observabilityNotebooksPluginOrder,
      mount: appMountWithStartPage('/notebooks'),
      appRoute: "/app/observability-dashboards#/notebooks",
      defaultPath: "/",
    });

    // Return methods that should be available to other plugins
    return {};
  }
  public start(core: CoreStart): ObservabilityStart {
    return {};
  }
  public stop() {}
}
