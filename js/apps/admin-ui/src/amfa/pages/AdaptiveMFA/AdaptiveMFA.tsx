import { Control, Controller, FieldValues, FormProvider, useFieldArray, useForm, useWatch } from "react-hook-form";
import { MultiLineInput } from "../../../components/multi-line-input/MultiLineInput";
import {
  ActionGroup,
  AlertVariant,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Form,
  FormGroup,
  FormSection,
  FormSelect,
  FormSelectOption,
  Switch,
  TextArea,
  TextInput,
} from "@patternfly/react-core";
import { PlusCircleIcon } from "@patternfly/react-icons";
import {
  ExpandableRowContent,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from "@patternfly/react-table";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { useAdminClient } from "../../../admin-client";
import "./css/amfa.css"
import { useRealm } from "../../../context/realm-context/RealmContext";
import { HelpItem, useAlerts } from "@keycloak/keycloak-ui-shared";
import MultiSelect from "../../components/MultiSelect";
import fallbackCountries from '../../assets/countries.json';
import { getAuthorizationHeaders } from "../../../utils/getAuthorizationHeaders";

const WEIGHT_OPTIONS = [
  { label: "Low", value: "1" },
  { label: "Medium", value: "2" },
  { label: "High", value: "3" },
];

const amfaFieldLabel = {
  fontSize: "13px",
  fontWeight: 500,
  marginBottom: "6px",
  color: "var(--pf-v5-global--Color--100)",
} as const;

const SIMPLE_SIGNALS: { key: string; label: string; desc: string }[] = [
  { key: "client", label: "client", desc: "adaptive-mfa-client-id-description" },
  { key: "device", label: "device", desc: "adaptive-mfa-device-description" },
  { key: "browserWindow", label: "browserWindow", desc: "adaptive-mfa-browser-window-description" },
  { key: "riskTypeClass", label: "riskTypeClass", desc: "adaptive-mfa-risk-type-class-description" },
  { key: "timeInterval", label: "timeInterval", desc: "adaptive-mfa-time-interval-description" },
  { key: "clientLanguage", label: "clientLanguage", desc: "adaptive-mfa-system-language-description" },
  { key: "screenResolution", label: "screenResolution", desc: "adaptive-mfa-screen-resolution-description" },
  { key: "concurrentSession", label: "concurrentSession", desc: "adaptive-mfa-concurrent-session-description" },
  { key: "loginFailure", label: "loginFailure", desc: "adaptive-mfa-login-failure-description" },
  { key: "recentAccountChange", label: "recentAccountChange", desc: "adaptive-mfa-recent-account-change-description" },
  { key: "geoClusterLabel", label: "geoClusterLabel", desc: "adaptive-mfa-geolocation-cluster-description" },
  { key: "impossibleTravel", label: "impossibleTravel", desc: "adaptive-mfa-impossible-travel-description" },
];

const ARRAY_SIGNALS: { key: string; label: string; desc: string }[] = [
  { key: "ipAddress", label: "ipAddress", desc: "adaptive-mfa-ip-address-description" },
  { key: "operationSystem", label: "operationSystem", desc: "adaptive-mfa-operating-system-description" },
  { key: "dateTime", label: "dataTime", desc: "adaptive-mfa-date-time-description" },
  { key: "geoLoc", label: "geoLoc", desc: "adaptive-mfa-geo-loc-description" },
  { key: "vpnMask", label: "vpnMask", desc: "adaptive-mfa-vpn-mask-description" },
  { key: "inActiveAcc", label: "inActiveAcc", desc: "adaptive-mfa-in-active-account-description" },
];

export type AuthConfigSuper = {
  necessaryParameters: {
    adaptiveToggle: boolean;
    adaptiveAuthEndpoint: string;
    fallbackRisk: number;
    notifyUsersRiskyLogin: boolean;
  };
  client: {
    isDisabled: any;
    weight: string;
  };
  ipAddress: {
    isDisabled: any;
    weight: string;
    insertIPWhitelist?: string;
    insertIPBlacklist?: string;
    groupId: string;
  }[];
  device: {
    isDisabled: any;
    weight: string;
  };
  operationSystem: {
    isDisabled: any;
    weight: string;
    insertOSWhitelist: string;
    insertOSBlacklist: string;
    groupId: string;
  }[];
  browserWindow: {
    isDisabled: any;
    weight: string;
  };


  dateTime: {
    isDisabled: any;
    weight: string;
    startTimeWhitelist: string;
    endTimeWhitelist?: string;
    startTimeBlacklist: string;
    endTimeBlacklist?: string;
    groupId?: string;
  }[];
  riskTypeClass: {
    isDisabled: any;
    weight: string;
  };
  timeInterval: {
    isDisabled: any;
    weight: string;
  };
  geoLoc: {
    isDisabled: any;
    weight: string;
    countriesWhitelist: string[];
    countriesBlacklist: string[];
    groupId: string;
  }[];
  clientLanguage: {
    isDisabled: any;
    weight: string;
  };
  screenResolution: {
    isDisabled: any;
    weight: string;
  };
  vpnMask: {
    isDisabled: any;
    weight: string;
    insertVpnWhitelist?: string;
    insertVpnBlacklist?: string;
    groupId: string;
  }[];
  inActiveAcc: {
    isDisabled: any;
    weight: string;
    groupId: string;
    // Realm-level: only row 0 (the default scope) carries a meaningful value.
    inactiveDays: number;
  }[];
  concurrentSession: {
    isDisabled: any;
    weight: string;
  };
  loginFailure: {
    isDisabled: any;
    weight: string;
  };
  recentAccountChange: {
    isDisabled: any;
    weight: string;
  };
  geoClusterLabel: {
    isDisabled: any;
    weight: string;
  };
  impossibleTravel: {
    isDisabled: any;
    weight: string;
  };
};

interface Parameter {
  name: string;
  weight: string;
  isDisabled: any;
  disabled: any;
  values?: { [key: string]: string[] };
  group_id?: string;
}
interface Group {
  id: string;
  name: string;
}
interface Country {
  name: string;
  code: string;
}

export default function AdaptiveMFA() {
  const { t } = useTranslation();

  const { realm } = useRealm();
  const { addAlert, addError } = useAlerts();
  const [countryOptions, setCountryOptions] = useState([]);
  const { adminClient } = useAdminClient();
  const [groupsOptions, setGroupOptions] = useState([]);
  const [scoringMode, setScoringMode] = useState("weight");
  const [scoringBias, setScoringBias] = useState("");
  const [scoringThresholds, setScoringThresholds] = useState("");
  const [expandedSignals, setExpandedSignals] = useState<string[]>([]);
  // Set when the current configuration could not be loaded. The form then holds
  // its built-in defaults rather than the realm's real settings, so saving would
  // overwrite live config with defaults. Saving is blocked until a reload works.
  const [configLoadFailed, setConfigLoadFailed] = useState(false);
  const toggleSignal = (key: string) =>
    setExpandedSignals((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );

  const enableSwitch = (name: string) => (
    <Controller
      name={name as any}
      control={control}
      render={({ field }) => (
        <Switch
          id={name}
          label={t("on")}
          labelOff={t("off")}
          isChecked={String(field.value) === "false"}
          onChange={(_event, checked) =>
            field.onChange(checked ? "false" : "true")
          }
        />
      )}
    />
  );

  const formSelect = (
    name: string,
    options: { label: string; value: string }[],
    placeholder?: string,
  ) => (
    <Controller
      name={name as any}
      control={control}
      render={({ field }) => (
        <FormSelect
          id={name}
          value={field.value ?? ""}
          onChange={(_event, v) => field.onChange(v)}
        >
          {placeholder !== undefined && (
            <FormSelectOption value="" label={placeholder} />
          )}
          {options.map((o) => (
            <FormSelectOption key={o.value} value={o.value} label={o.label} />
          ))}
        </FormSelect>
      )}
    />
  );

  const weightSelect = (name: string) => formSelect(name, WEIGHT_OPTIONS);

  const listFields = (key: string, index: number) => {
    switch (key) {
      case "ipAddress":
      case "operationSystem":
      case "vpnMask": {
        const wl =
          key === "ipAddress"
            ? "insertIPWhitelist"
            : key === "operationSystem"
              ? "insertOSWhitelist"
              : "insertVpnWhitelist";
        const bl =
          key === "ipAddress"
            ? "insertIPBlacklist"
            : key === "operationSystem"
              ? "insertOSBlacklist"
              : "insertVpnBlacklist";
        return (
          <>
            <FormGroup label={t("amfaAllowList")} fieldId={`${key}-wl-${index}`}>
              <MultiLineInput
                id={`${key}-wl-${index}`}
                name={`${key}.${index}.${wl}`}
                aria-label={t("amfaAllowList")}
                addButtonLabel="amfaAddValue"
                stringify
              />
            </FormGroup>
            <FormGroup label={t("amfaDenyList")} fieldId={`${key}-bl-${index}`}>
              <MultiLineInput
                id={`${key}-bl-${index}`}
                name={`${key}.${index}.${bl}`}
                aria-label={t("amfaDenyList")}
                addButtonLabel="amfaAddValue"
                stringify
              />
            </FormGroup>
          </>
        );
      }
      case "inActiveAcc":
        // Realm-level, not a per-group override: renderEditor calls
        // listFields(key, 0) for the default scope and listFields(key, index)
        // with index >= 1 inside each group-override card, so gating on index 0
        // keeps the threshold out of the override cards.
        if (index !== 0) return null;
        return (
          <FormGroup
            label={t("amfaInactiveDaysLabel")}
            fieldId="inActiveAcc-days"
          >
            <TextInput
              type="number"
              min={1}
              id="inActiveAcc-days"
              {...register("inActiveAcc.0.inactiveDays" as const, {
                valueAsNumber: true,
              })}
            />
            <div
              style={{
                fontSize: "13px",
                color: "var(--pf-v5-global--Color--200)",
                marginTop: "4px",
              }}
            >
              {t("amfaInactiveDaysHelp")}
            </div>
          </FormGroup>
        );
      case "dateTime":
        return (
          <>
            <FormGroup label={t("amfaAllowList")} fieldId={`dt-wl-${index}`}>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <TextInput
                  type="time"
                  aria-label="allow from"
                  {...register(`dateTime.${index}.startTimeWhitelist` as const)}
                />
                <span>–</span>
                <TextInput
                  type="time"
                  aria-label="allow to"
                  {...register(`dateTime.${index}.endTimeWhitelist` as const)}
                />
              </div>
            </FormGroup>
            <FormGroup label={t("amfaDenyList")} fieldId={`dt-bl-${index}`}>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <TextInput
                  type="time"
                  aria-label="deny from"
                  {...register(`dateTime.${index}.startTimeBlacklist` as const)}
                />
                <span>–</span>
                <TextInput
                  type="time"
                  aria-label="deny to"
                  {...register(`dateTime.${index}.endTimeBlacklist` as const)}
                />
              </div>
            </FormGroup>
          </>
        );
      case "geoLoc":
        return (
          <>
            <FormGroup label={t("Countries Whitelist")} fieldId={`geo-wl-${index}`}>
              <MultiSelect
                name={`geoLoc.${index}.countriesWhitelist`}
                control={control}
                options={countryOptions}
              />
            </FormGroup>
            <FormGroup label={t("Countries Blacklist")} fieldId={`geo-bl-${index}`}>
              <MultiSelect
                name={`geoLoc.${index}.countriesBlacklist`}
                control={control}
                options={countryOptions}
              />
            </FormGroup>
          </>
        );
      default:
        return null;
    }
  };

  const renderEditor = (
    key: string,
    fieldsArr: any[],
    appendFn: (entry: any) => void,
    removeFn: (index: number) => void,
    emptyGroup: any,
  ) => {
    const overrides = fieldsArr.slice(1);
    return (
      <div style={{ padding: "12px 4px 8px" }}>
        {/* The shared hint speaks of "lists" and of overrides using different
            lists. True for the list-based signals, but wrong for inActiveAcc:
            it has no lists, and its threshold is realm-level, so a group
            override cannot change it. Showing it there contradicted that
            field's own help text directly below. That field states its own
            scope, so the shared hint is simply omitted for it. */}
        {key !== "inActiveAcc" && (
          <div
            data-testid={`${key}-scope-help`}
            style={{
              fontSize: "13px",
              color: "var(--pf-v5-global--Color--200)",
              marginBottom: "12px",
            }}
          >
            {t("amfaDefaultScopeHelp")}
          </div>
        )}
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}
        >
          {listFields(key, 0)}
        </div>

        {overrides.length > 0 && (
          <div
            style={{
              fontSize: "13px",
              fontWeight: 500,
              color: "var(--pf-v5-global--Color--200)",
              margin: "24px 0 8px",
            }}
          >
            {t("amfaGroupOverrides")}
          </div>
        )}
        {overrides.map((f: any, i: number) => {
          const index = i + 1;
          return (
            <Card key={f.id} isCompact isFlat style={{ marginBottom: "12px" }}>
              <CardHeader
                actions={{
                  actions: (
                    <Button
                      variant="link"
                      isDanger
                      isInline
                      onClick={() => removeFn(index)}
                    >
                      {t("amfaRemove")}
                    </Button>
                  ),
                }}
              >
                <CardTitle style={{ fontSize: "14px", fontWeight: 500 }}>
                  {t("amfaGroupOverride")}
                </CardTitle>
              </CardHeader>
              <CardBody>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                    gap: "16px",
                    alignItems: "start",
                    marginBottom: "20px",
                  }}
                >
                  <div>
                    <div style={amfaFieldLabel}>{t("amfaGroup")}</div>
                    {formSelect(
                      `${key}.${index}.groupId`,
                      groupsOptions,
                      t("amfaSelectOption"),
                    )}
                  </div>
                  <div>
                    <div style={amfaFieldLabel}>{t("amfaStatusColumn")}</div>
                    {enableSwitch(`${key}.${index}.isDisabled`)}
                  </div>
                  <div>
                    <div style={amfaFieldLabel}>{t("amfaWeightColumn")}</div>
                    {weightSelect(`${key}.${index}.weight`)}
                  </div>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "24px",
                  }}
                >
                  {listFields(key, index)}
                </div>
              </CardBody>
            </Card>
          );
        })}

        <Button
          variant="link"
          icon={<PlusCircleIcon />}
          onClick={() => appendFn(emptyGroup)}
          style={{ paddingLeft: 0, marginTop: "8px" }}
        >
          {t("amfaAddGroup")}
        </Button>
      </div>
    );
  };

  const editorFor = (key: string) => {
    switch (key) {
      case "ipAddress":
        return renderEditor("ipAddress", fields, append, remove, {
          isDisabled: "true",
          weight: "1",
          insertIPWhitelist: "",
          insertIPBlacklist: "",
          groupId: "",
        });
      case "operationSystem":
        return renderEditor(
          "operationSystem",
          operationSystemFields,
          appendOperationSystem,
          removeOperationSystem,
          { isDisabled: "true", weight: "1", insertOSWhitelist: "", insertOSBlacklist: "", groupId: "" },
        );
      case "dateTime":
        return renderEditor("dateTime", dateTimeFields, appendDataTime, removeDataTime, {
          isDisabled: "true",
          weight: "1",
          startTimeWhitelist: "",
          endTimeWhitelist: "",
          startTimeBlacklist: "",
          endTimeBlacklist: "",
          groupId: "",
        });
      case "geoLoc":
        return renderEditor("geoLoc", geoLocFields, appendGeoLoc, removeGeoLoc, {
          isDisabled: "true",
          weight: "1",
          countriesWhitelist: [],
          countriesBlacklist: [],
          groupId: "",
        });
      case "vpnMask":
        return renderEditor("vpnMask", vpnMaskFields, appendVpnMask, removeVpnMask, {
          isDisabled: "true",
          weight: "1",
          insertVpnWhitelist: "",
          insertVpnBlacklist: "",
          groupId: "",
        });
      case "inActiveAcc":
        return renderEditor(
          "inActiveAcc",
          inActiveAccFields,
          appendInActiveAcc,
          removeInActiveAcc,
          { isDisabled: "true", weight: "1", groupId: "" },
        );
      default:
        return null;
    }
  };
  const methods = useForm<AuthConfigSuper>({
      defaultValues: {
        necessaryParameters: {
          adaptiveToggle: false,
          adaptiveAuthEndpoint: "",
          fallbackRisk: 1,
          notifyUsersRiskyLogin: true,
        },
        client: {
          isDisabled: "true",
          weight: "1",
        },
        ipAddress: [
          {
            isDisabled: "true",
            weight: "1",
            insertIPWhitelist: "",
            insertIPBlacklist: "",
          },
        ],
        device: {
          isDisabled: "true",
          weight: "1",
        },
        operationSystem: [
          {
            isDisabled: "true",
            weight: "1",
            insertOSWhitelist: "",
            insertOSBlacklist: "",
          },
        ],
        browserWindow: {
          isDisabled: "true",
          weight: "1",
        },
        dateTime: [
          {
            isDisabled: "true",
            weight: "1",
            startTimeWhitelist: "",
            endTimeWhitelist: "",
            startTimeBlacklist: "",
            endTimeBlacklist: "",
          },
        ],
        riskTypeClass: {
          isDisabled: "true",
          weight: "1",
        },
        timeInterval: {
          isDisabled: "true",
          weight: "1",
        },
        geoLoc: [
          {
            isDisabled: "true",
            weight: "1",
            countriesWhitelist: countryOptions,
            countriesBlacklist: countryOptions,
          },
        ],
        clientLanguage: {
          isDisabled: "true",
          weight: "1",
        },
        screenResolution: {
          isDisabled: "true",
          weight: "1",
        },
        vpnMask: [
          {
            isDisabled: "true",
            weight: "1",
            insertVpnWhitelist: "",
            insertVpnBlacklist: "",
          },
        ],
        inActiveAcc: [
          {
            isDisabled: "true",
            weight: "1",
            inactiveDays: 0,
          },
        ],
        concurrentSession: {
          isDisabled: "true",
          weight: "1",
        },
        loginFailure: {
          isDisabled: "true",
          weight: "1",
        },
        recentAccountChange: {
          isDisabled: "true",
          weight: "1",
        },
        geoClusterLabel: {
          isDisabled: "true",
          weight: "1",
        },
        impossibleTravel: {
          isDisabled: "true",
          weight: "1",
        },
      },
    });
  const { register, control, handleSubmit, setValue, getValues } = methods;

  const { fields, append, remove, replace } = useFieldArray({
    name: "ipAddress",
    control,
  });
  const {
    fields: operationSystemFields,
    append: appendOperationSystem,
    remove: removeOperationSystem,
    replace: replaceOperationSystem,
  } = useFieldArray({
    name: "operationSystem",
    control,
  });

  const {
    fields: geoLocFields,
    append: appendGeoLoc,
    remove: removeGeoLoc,
    replace: replaceGeoLoc,
  } = useFieldArray({
    name: "geoLoc",
    control,
  });

  const {
    fields: vpnMaskFields,
    append: appendVpnMask,
    remove: removeVpnMask,
    replace: replaceVpnMask,
  } = useFieldArray({
    name: "vpnMask",
    control,
  });

  const {
    fields: inActiveAccFields,
    append: appendInActiveAcc,
    remove: removeInActiveAcc,
    replace: replaceInActiveAcc,
  } = useFieldArray({
    name: "inActiveAcc",
    control,
  });

  const {
    fields: dateTimeFields,
    append: appendDataTime,
    remove: removeDataTime,
    replace: replaceDataTime,
  } = useFieldArray({
    name: "dateTime",
    control,
  });

  const arrayReplace: Record<string, (items: any[]) => void> = {
    ipAddress: replace,
    operationSystem: replaceOperationSystem,
    geoLoc: replaceGeoLoc,
    vpnMask: replaceVpnMask,
    inActiveAcc: replaceInActiveAcc,
    dateTime: replaceDataTime,
  };
  const enable = useWatch({
    control,
    name: "necessaryParameters.adaptiveToggle",
  });

  const getCountries = async () => {
    const url = `${adminClient.baseUrl}/realms/${adminClient.realmName}/amfa-api/countries`;
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });
      const jsonData = await response.json();
      const countryOptions = jsonData.map((country: Country) => ({
        label: country.name,
        value: country.name,
      }));
      setCountryOptions(countryOptions);
    } catch (error) {
    }
  };

  const getGroups = async () => {
    const url = `${adminClient.baseUrl}/realms/${adminClient.realmName}/amfa-api/groups`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...getAuthorizationHeaders(await adminClient.getAccessToken()),
        },
      });
      if (!response.ok) {
        console.error("Network response was not ok");
        return;
      }
      const jsonGroupsData = await response.json();
      const groupsOptions = jsonGroupsData.map((group: Group) => ({
        label: group.name,
        value: group.id,
      }));
      setGroupOptions(groupsOptions);
    } catch (error) {
      console.error("Error geting groups:", error);
    }
  };

  const getCountryNamesFromCodes = (
    codes: string[]
  ): string[] => {
    const lookupOptions = fallbackCountries.map((c: Country) => ({
      label: c.name,
      value: c.code,
    }));

    const codeToNameMap = Object.fromEntries(
      lookupOptions.map(opt => [opt.value, opt.label])
    );

    return codes.map(code => codeToNameMap[code] || code);
  };

  const fetchData = async () => {
    const url = `${adminClient.baseUrl}/realms/${adminClient.realmName}/amfa-api/fetchAdaptiveMFAParameters`;
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...getAuthorizationHeaders(await adminClient.getAccessToken()),
        },
      });
      if (!response.ok) {
        // The page then looked normal while showing values
        // that were never the realm's, and saving would overwrite the real config
        // with them. Surface it and block saving instead.
        setConfigLoadFailed(true);
        addError(
          "amfaLoadError",
          new Error(`HTTP ${response.status}: ${await response.text()}`),
        );
        return;
      }
      const jsonData = await response.json();
      console.log("Response from BE:", jsonData);
  
      if (Array.isArray(jsonData)) {
        const parameterMap: Record<
          string,
          keyof Omit<AuthConfigSuper, "necessaryParameters">
        > = {
          client: "client",
          ip_address: "ipAddress",
          device: "device",
          operating_system: "operationSystem",
          browser: "browserWindow",
          date_time: "dateTime",
          event_cluster_label: "riskTypeClass",
          time_interval: "timeInterval",
          country_name: "geoLoc",
          system_language: "clientLanguage",
          screen_resolution: "screenResolution",
          anonymous_detection: "vpnMask",
          inactive_account: "inActiveAcc",
          concurrent_session: "concurrentSession",
          login_failure: "loginFailure",
          recent_account_change: "recentAccountChange",
          geolocation_cluster_label: "geoClusterLabel",
          impossible_travel: "impossibleTravel",
        };
  
        // Group parameters by parameter_name
        const paramsByName: Record<string, any[]> = {};
        
        // Group all parameters by name
        jsonData.forEach(param => {
          const name = param.parameter_name;
          if (!paramsByName[name]) {
            paramsByName[name] = [];
          }
          paramsByName[name].push(param);
        });
  
        // Process each parameter group
        Object.entries(paramsByName).forEach(([paramName, paramList]) => {
          // Sort to prioritize non-default realm_id
          paramList.sort((a, b) => {
            if (a.realm_id === "default" && b.realm_id !== "default") return 1;
            if (a.realm_id !== "default" && b.realm_id === "default") return -1;
            return 0;
          });
  
          const key = parameterMap[paramName];
          
          if (key) {
            if (
              key === "ipAddress" ||
              key === "operationSystem" ||
              key === "dateTime" ||
              key === "geoLoc" ||
              key === "vpnMask" ||
              key === "inActiveAcc"
            ) {
              // Get the highest priority realm_id
              const highestPriorityRealmId = paramList[0].realm_id;
              
              // Filter to get only params with the highest priority realm_id
              const highestPriorityParams = paramList.filter(
                p => p.realm_id === highestPriorityRealmId
              );
              
              // Create a map to store unique items by group_id
              const itemsByGroupId = new Map();
              
              // Process each parameter to create items for each unique group_id
              highestPriorityParams.forEach(param => {
                const groupId = param.group_id || "default";
                let item;
                
                switch (key) {
                  case "ipAddress":
                    item = {
                      isDisabled: param.disabled.toString(),
                      weight: param.weight.toString(),
                      insertIPWhitelist: param.whitelist && param.whitelist.length > 0
                        ? param.whitelist.join("##")
                        : "",
                      insertIPBlacklist: param.blacklist && param.blacklist.length > 0
                        ? param.blacklist.join("##")
                        : "",
                      groupId: groupId,
                    };
                    break;
                  case "operationSystem":
                    item = {
                      isDisabled: param.disabled.toString(),
                      weight: param.weight.toString(),
                      insertOSWhitelist: param.whitelist && param.whitelist.length > 0
                        ? param.whitelist.join("##")
                        : "",
                      insertOSBlacklist: param.blacklist && param.blacklist.length > 0
                        ? param.blacklist.join("##")
                        : "",
                      groupId: groupId,
                    };
                    break;
                  case "dateTime":
                    const dateTimeValuesWhitelist = param.whitelist && param.whitelist.length > 0
                      ? param.whitelist[0].split("-")
                      : ["", ""];
                    const dateTimeValuesBlacklist = param.blacklist && param.blacklist.length > 0
                      ? param.blacklist[0].split("-")
                      : ["", ""];
                    item = {
                      isDisabled: param.disabled.toString(),
                      weight: param.weight.toString(),
                      startTimeWhitelist: dateTimeValuesWhitelist[0],
                      endTimeWhitelist: dateTimeValuesWhitelist[1],
                      startTimeBlacklist: dateTimeValuesBlacklist[0],
                      endTimeBlacklist: dateTimeValuesBlacklist[1],
                      groupId: groupId,
                    };
                    break;
                  case "geoLoc":
                    item = {
                      isDisabled: param.disabled.toString(),
                      weight: param.weight.toString(),
                      countriesWhitelist: getCountryNamesFromCodes(param.whitelist || []),
                      countriesBlacklist: getCountryNamesFromCodes(param.blacklist || []),
                      groupId: groupId,
                    };
                    break;
                  case "vpnMask":
                    item = {
                      isDisabled: param.disabled.toString(),
                      weight: param.weight.toString(),
                      insertVpnWhitelist: param.whitelist && param.whitelist.length > 0
                        ? param.whitelist.join("##")
                        : "",
                      insertVpnBlacklist: param.blacklist && param.blacklist.length > 0
                        ? param.blacklist.join("##")
                        : "",
                      groupId: groupId,
                    };
                    break;
                  case "inActiveAcc":
                    item = {
                      isDisabled: param.disabled.toString(),
                      weight: param.weight.toString(),
                      // Only the default row carries a threshold; group override
                      // rows legitimately have none, and the field is not
                      // rendered for them.
                      inactiveDays: Number(param.inactive_days ?? 0),
                      groupId: groupId,
                    };
                    break;
                }
                
                // Add the item to our map if it's valid
                if (item) {
                  itemsByGroupId.set(groupId, item);
                }
              });
              
              // Convert map values to array and set the form value.
              // Use the field array's replace() so the controlled rows
              // (switch, weight, lists) re-sync; setValue on the whole array
              // does not refresh useFieldArray's rendered fields.
              if (itemsByGroupId.size > 0) {
                // Row 0 is rendered as the realm-default scope and rows 1+ as
                // group overrides, but the API returns rows in arbitrary
                // order - pin the "default" group to index 0 so overrides
                // never render (and later save) as the realm default.
                const arrayValue = Array.from(itemsByGroupId.values()).sort(
                  (a: any, b: any) =>
                    (a.groupId === "default" ? 0 : 1) -
                    (b.groupId === "default" ? 0 : 1),
                );
                const replaceFn = arrayReplace[key];
                if (replaceFn) {
                  replaceFn(arrayValue);
                } else {
                  setValue(key, arrayValue);
                }
                // Force-sync each leaf so the row controls that bind to
                // `${key}.${i}.*` directly (switch, weight, lists) reflect the
                // fetched values; replace() alone does not always re-render
                // those standalone controllers.
                arrayValue.forEach((it: any, i: number) => {
                  Object.entries(it).forEach(([fk, fv]) => {
                    setValue(`${key}.${i}.${fk}` as any, fv as any);
                  });
                });
              }
            } else {
              // For non-array fields, set each leaf so the bound controls
              // (switch, weight) re-render reliably.
              const param = paramList[0];
              setValue(`${key}.isDisabled` as any, param.disabled.toString());
              setValue(`${key}.weight` as any, param.weight.toString());
            }
          }
        });
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      setConfigLoadFailed(true);
      addError("amfaLoadError", error);
    }
  };

  const getScoringConfig = async () => {
    const url = `${adminClient.baseUrl}/realms/${adminClient.realmName}/amfa-api/fetchScoringConfig`;
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          ...getAuthorizationHeaders(await adminClient.getAccessToken()),
        },
      });
      if (response.ok) {
        const data = await response.json();
        if (data) {
          setScoringMode(data.mode || "weight");
          setScoringBias(data.bias !== null && data.bias !== undefined ? String(data.bias) : "");
          setScoringThresholds(
            Array.isArray(data.thresholds) ? data.thresholds.join(", ") : "",
          );
        }
      } else {
        // The scoring fields feed the save payload too, so an unnoticed failure
        // here would write the default "weight" mode over the realm's real
        // scoring config on the next save.
        setConfigLoadFailed(true);
        addError(
          "amfaLoadError",
          new Error(`HTTP ${response.status}: ${await response.text()}`),
        );
      }
    } catch (error) {
      console.error("Error fetching scoring config:", error);
      setConfigLoadFailed(true);
      addError("amfaLoadError", error);
    }
  };

  useEffect(() => {
    fetchData();
    updateParameters();
    getCountries();
    getGroups();
    getScoringConfig();
  }, []);

  async function updateParameters() {
    try {
      const realmRep = await adminClient.realms.findOne({ realm });

      setValue(
        "necessaryParameters.adaptiveToggle",
        realmRep?.attributes?.adaptiveToggle === "true" ||
        realmRep?.attributes?.adaptiveToggle === true ||
        false
      );
      setValue(
        "necessaryParameters.adaptiveAuthEndpoint",
        realmRep?.attributes?.adaptiveAuthEndpoint || "",
      );
      setValue(
        "necessaryParameters.fallbackRisk",
        realmRep?.attributes?.fallbackRisk || 1,
      );
      setValue(
        "necessaryParameters.notifyUsersRiskyLogin",
        realmRep?.attributes?.notifyUsersRiskyLogin === "true" ||
        realmRep?.attributes?.notifyUsersRiskyLogin === true ||
        false
      );

    } catch (error) {
      console.error("Error retrieving realmRep:", error);
      throw error;
    }
  }

  /* IP Addresses error state variables */
  const [ipWhitelistErrorIndex, setIpWhitelistErrorIndex] = useState<number | null>(null);
  const [ipBlacklistErrorIndex, setIpBlacklistErrorIndex] = useState<number | null>(null);

  /* Function to validate if the whitelists/blacklists of IP adrresses are valid */
  const validateIpsBlacklistWhitelist = (ipAddress: any, index: number): boolean => {
    // Cleaning the error states
    setIpWhitelistErrorIndex(null);
    setIpBlacklistErrorIndex(null);

    // Validate if a string is a valid ipv4 or ipv6
    function isValidIP(ip: string): boolean {
      const ipv4Regex = /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}$/;
      const ipv6Regex = /^(([0-9a-fA-F]{1,4}):){7}([0-9a-fA-F]{1,4})$/;
      return ipv4Regex.test(ip) || ipv6Regex.test(ip);
    }
  
    // Extracting the whitelist/blacklist from string
    const whitelist = ipAddress.insertIPWhitelist
      ? ipAddress.insertIPWhitelist.split("##").map((ip: string) => ip.trim())
      : [];
  
    const blacklist = ipAddress.insertIPBlacklist
      ? ipAddress.insertIPBlacklist.split("##").map((ip: string) => ip.trim())
      : [];
  
    // Extracting the invalid ips
    const invalidWhitelist = whitelist.filter((ip: string) => !isValidIP(ip));
    const invalidBlacklist = blacklist.filter((ip: string) => !isValidIP(ip));
  
    // If there are invalid ips in the blacklist/whitelist, 
    // show an error, sets the index of the list in the error state and return false
    // Use addAlert (not addError): addError treats its first argument as an
    // i18n key passed to t(), and a dynamic message containing ':' and '.'
    // (namespace/key separators in i18next) mis-parses into a blank toast - so
    // the save was blocked with no visible error. addAlert renders the message
    // verbatim as a danger toast.
    if (invalidWhitelist.length > 0) {
      addAlert(`Invalid IPs on allow list: ${invalidWhitelist.join(", ")}`, AlertVariant.danger);
      setIpWhitelistErrorIndex(index);
      return false;
    } else if (invalidBlacklist.length > 0) {
      addAlert(`Invalid IPs on deny list: ${invalidBlacklist.join(", ")}`, AlertVariant.danger);
      setIpBlacklistErrorIndex(index)
      return false;
    }
  
    return true;
  };
  

  const onSubmit = async (data: AuthConfigSuper) => {
    // Defence in depth behind the disabled Save button, which is what actually
    // prevents this today: browsers suppress implicit form submission while the
    // form's submit button is disabled, so pressing Enter does NOT reach here.
    // This guard exists for the day someone drops `isDisabled` or adds another
    // submit path, because overwriting live config with defaults is not
    // recoverable from this UI. Covered by the requestSubmit() test in
    // adaptive-mfa-errors.spec.ts, which is how the guard is reachable at all.
    if (configLoadFailed) {
      addError("amfaLoadError", new Error(t("amfaSaveBlockedLoadFailed")));
      return;
    }
    try {
      // Validating the whitelists/blacklist ip inputs
      for (let index = 0; index < data.ipAddress.length; index++) {
        const ipAddress = data.ipAddress[index];
        if (!validateIpsBlacklistWhitelist(ipAddress, index)) {
          return false;
        }
      }

      const realmRep = await adminClient.realms.findOne({ realm });
      const url = `${adminClient.baseUrl}/realms/${adminClient.realmName}/amfa-api/updateAdaptiveMFAParameters`;

      const updatedAttributes = {
        ...realmRep,
        attributes: {
          // Merge with the existing attributes - replacing the map wholesale
          // silently destroys every non-AMFA realm attribute on each save
          // (frontendUrl, SCIM flags, custom attributes, ...).
          ...realmRep?.attributes,
          adaptiveAuthEndpoint: data.necessaryParameters.adaptiveAuthEndpoint,
          adaptiveToggle: data.necessaryParameters.adaptiveToggle,
          fallbackRisk: data.necessaryParameters.fallbackRisk,
          notifyUsersRiskyLogin: data.necessaryParameters.notifyUsersRiskyLogin,
        },
      };
      await adminClient.realms.update({ realm }, updatedAttributes);
      const parameterNames = [
        { key: "client", name: "client" },
        { key: "ipAddress", name: "ip_address" },
        { key: "device", name: "device" },
        { key: "operationSystem", name: "operating_system" },
        { key: "browserWindow", name: "browser" },
        { key: "dateTime", name: "date_time" },
        { key: "riskTypeClass", name: "event_cluster_label" },
        { key: "timeInterval", name: "time_interval" },
        { key: "geoLoc", name: "country_name" },
        { key: "clientLanguage", name: "system_language" },
        { key: "screenResolution", name: "screen_resolution" },
        { key: "vpnMask", name: "anonymous_detection" },
        { key: "inActiveAcc", name: "inactive_account" },
        { key: "concurrentSession", name: "concurrent_session" },
        { key: "loginFailure", name: "login_failure" },
        { key: "recentAccountChange", name: "recent_account_change" },
        { key: "geoClusterLabel", name: "geolocation_cluster_label" },
        { key: "impossibleTravel", name: "impossible_travel" },
      ];

      const formattedData = {
        parameters: parameterNames.flatMap(({ key, name }) => {
          if (
            key === "ipAddress" ||
            key === "operationSystem" ||
            key === "dateTime" ||
            key === "geoLoc" ||
            key === "vpnMask" ||
            key === "inActiveAcc"
          ) {
            return (data as any)[key].map((entry: any, entryIndex: number) => {
              const row: any = {
                realm_id: realmRep?.realm,
                disabled: entry.isDisabled,
                weight: entry.weight,
                parameter_name: name,
                // The form field is camelCase `groupId`; the old snake_case
                // read was always undefined, mislabeling every row "default".
                group_id: entry.groupId || "default",
                blacklist: [],
                whitelist: [],
              };
              // The dormancy threshold is realm-level, so only the default-scope row
              // carries it, and only when it is a usable positive integer. Empty, 0,
              // negative and NaN are all omitted, which is how "unset, use the server
              // default" reaches the engine.
              // Clamped to a sane upper bound (100 years): the input has no max
              // attribute enforced (PatternFly's Form renders noValidate), and a
              // value beyond Java's Integer.MAX_VALUE makes Jackson reject the PUT
              // in the SPI, silently discarding the whole page's changes.
              if (key === "inActiveAcc" && entryIndex === 0) {
                const days = Number(entry.inactiveDays);
                if (Number.isFinite(days) && days >= 1) {
                  const MAX_INACTIVE_DAYS = 36500; // 100 years
                  row.inactive_days = Math.min(Math.floor(days), MAX_INACTIVE_DAYS);
                }
              }
              return row;
            });
          } else {
            return {
              realm_id: realmRep?.realm,
              disabled: (data as any)[key].isDisabled,
              weight: (data as any)[key].weight,
              parameter_name: name,
              group_id: "default",
              blacklist: [],
              whitelist: [],
            };
          }
        }),
        extraParameter: {
          osArray: data.operationSystem.map((os: any) => ({
            whitelist: os.insertOSWhitelist
              ? os.insertOSWhitelist
                  .split("##")
                  .map((osItem: string) => osItem.trim())
              : [],
            blacklist: os.insertOSBlacklist
              ? os.insertOSBlacklist
                  .split("##")
                  .map((osItem: string) => osItem.trim())
              : [],
            group_id: os.groupId,
          })),
          ipAddressArray: data.ipAddress.map((ipAddress: any) => ({
            whitelist: ipAddress.insertIPWhitelist
              ? ipAddress.insertIPWhitelist
                  .split("##")
                  .map((ip: string) => ip.trim())
              : [],
            blacklist: ipAddress.insertIPBlacklist
              ? ipAddress.insertIPBlacklist
                  .split("##")
                  .map((ip: string) => ip.trim())
              : [],
            group_id: ipAddress.groupId,
          })),

          timeArray: data.dateTime.map((dateTime: any) => ({
            whitelist:
              dateTime.startTimeWhitelist && dateTime.endTimeWhitelist
                ? [
                    `${dateTime.startTimeWhitelist}-${dateTime.endTimeWhitelist}`,
                  ]
                : [],
            blacklist:
              dateTime.startTimeBlacklist && dateTime.endTimeBlacklist
                ? [
                    `${dateTime.startTimeBlacklist}-${dateTime.endTimeBlacklist}`,
                  ]
                : [],
            group_id: dateTime.groupId,
          })),
          vpnMaskArray: data.vpnMask.map((vpnMask: any) => ({
            whitelist: vpnMask.insertVpnWhitelist
              ? vpnMask.insertVpnWhitelist
                  .split("##")
                  .map((mask: string) => mask.trim())
              : [],
            blacklist: vpnMask.insertVpnBlacklist
              ? vpnMask.insertVpnBlacklist
                  .split("##")
                  .map((mask: string) => mask.trim())
              : [],
            group_id: vpnMask.groupId,
          })),
          countryNameArray: data.geoLoc.map((geoLoc: any) => ({
            whitelist: geoLoc.countriesWhitelist
              ? geoLoc.countriesWhitelist
              : [],
            blacklist: geoLoc.countriesBlacklist
              ? geoLoc.countriesBlacklist
              : [],
            group_id: geoLoc.groupId,
          })),
        },
      };
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthorizationHeaders(await adminClient.getAccessToken()),
        },
        body: JSON.stringify(formattedData),
      });
      // `fetch` only rejects on a network-level failure, so a 4xx/5xx resolves
      // normally and would otherwise fall through to the success alert below,
      // reporting "saved" for a save the server rejected. Throw instead and let
      // the existing catch surface it. The body carries the engine's own error
      // text via the SPI, so include it rather than a bare status code.
      if (!response.ok) {
        throw new Error(
          `Saving risk signals failed (HTTP ${response.status}): ${await response.text()}`,
        );
      }

      // Persist the per-realm risk-scoring config (mode/bias/thresholds).
      const scoringPayload: {
        mode: string;
        bias?: number;
        thresholds?: number[];
      } = { mode: scoringMode };
      if (scoringBias.trim() !== "") {
        scoringPayload.bias = Number(scoringBias);
      }
      if (scoringThresholds.trim() !== "") {
        scoringPayload.thresholds = scoringThresholds
          .split(",")
          .map((value) => Number(value.trim()));
      }
      const scoringResponse = await fetch(
        `${adminClient.baseUrl}/realms/${adminClient.realmName}/amfa-api/updateScoringConfig`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthorizationHeaders(await adminClient.getAccessToken()),
          },
          body: JSON.stringify(scoringPayload),
        },
      );
      // These are two independent writes, so this one can fail after the signals
      // above were persisted. Name the step in the message so the admin knows the
      // save was partial rather than assuming nothing was written.
      if (!scoringResponse.ok) {
        throw new Error(
          `Risk signals were saved, but saving the scoring config failed ` +
            `(HTTP ${scoringResponse.status}): ${await scoringResponse.text()}`,
        );
      }

      addAlert("All the data are saved", AlertVariant.success);
    } catch (error) {
      // Pass the KEY, not t(key). addError does t(messageKey, { error }), so a
      // pre-translated string arrives as an unknown key and the {{error}} detail
      // never gets interpolated — which silently discarded the reason for the
      // failure. Every stock call site passes a bare key for this reason.
      addError("amfaError", error);
    }
  };

  return (
    <FormProvider {...methods}>
    <Form
      isHorizontal
      onSubmit={handleSubmit(onSubmit)}
      style={{ maxWidth: "960px" }}
    >
      <FormGroup fieldId="adaptiveToggle" label={t("enabled")}>
        <Controller
          name="necessaryParameters.adaptiveToggle"
          defaultValue={true}
          control={control}
          render={({ field }) => (
            <Switch
              id="adaptiveToggle"
              label={t("on")}
              labelOff={t("off")}
              isChecked={field.value}
              onChange={field.onChange}
            />
          )}
        />
      </FormGroup>

      {enable && (
        <>
          <FormSection title={t("amfaGeneral")} titleElement="h2">
            <FormGroup
              label={t("adaptiveAuthApiEndpoint")}
              fieldId="adaptiveAuthApiEndpoint"
            >
              <TextInput
                id="adaptiveAuthApiEndpoint"
                data-testid="adaptiveAuthApiEndpoint"
                {...register("necessaryParameters.adaptiveAuthEndpoint", {
                  required: false,
                })}
              />
            </FormGroup>
            <FormGroup
              label={t("fallbackRiskLevel")}
              fieldId="necessaryParametersId"
              labelIcon={
                <HelpItem
                  helpText={t("fallbackRiskLevel")}
                  fieldLabelId="fallbackRiskLevel"
                />
              }
            >
              <Controller
                name="necessaryParameters.fallbackRisk"
                defaultValue={1}
                control={control}
                render={({ field }) => (
                  <TextInput
                    id="necessaryParametersId"
                    type="number"
                    min="1"
                    max="10"
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </FormGroup>
            <FormGroup
              label={t("adaptiveNotifyLoginAttempt")}
              fieldId="adaptiveNotifyLoginAttempt"
            >
              <Controller
                name="necessaryParameters.notifyUsersRiskyLogin"
                defaultValue={true}
                control={control}
                render={({ field }) => (
                  <Switch
                    id="adaptiveNotifyLoginAttempt"
                    label={t("on")}
                    labelOff={t("off")}
                    isChecked={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </FormGroup>
          </FormSection>

          <FormSection title={t("amfaRiskSignals")} titleElement="h2">
            <Table variant="compact" aria-label={t("amfaRiskSignals")}>
              <Thead>
                <Tr>
                  <Th screenReaderText="expand" />
                  <Th width={50}>{t("amfaSignalColumn")}</Th>
                  <Th>{t("amfaStatusColumn")}</Th>
                  <Th>{t("amfaWeightColumn")}</Th>
                </Tr>
              </Thead>
              {SIMPLE_SIGNALS.map((s) => (
                <Tbody key={s.key}>
                  <Tr>
                    <Td />
                    <Td dataLabel={t("amfaSignalColumn")}>
                      {t(s.label)}{" "}
                      <HelpItem helpText={t(s.desc)} fieldLabelId={s.label} />
                    </Td>
                    <Td dataLabel={t("amfaStatusColumn")}>
                      {enableSwitch(`${s.key}.isDisabled`)}
                    </Td>
                    <Td dataLabel={t("amfaWeightColumn")}>
                      {weightSelect(`${s.key}.weight`)}
                    </Td>
                  </Tr>
                </Tbody>
              ))}
              {ARRAY_SIGNALS.map((s, i) => {
                const open = expandedSignals.includes(s.key);
                return (
                  <Tbody key={s.key} isExpanded={open}>
                    <Tr>
                      <Td
                        expand={{
                          rowIndex: i,
                          isExpanded: open,
                          onToggle: () => toggleSignal(s.key),
                          expandId: `${s.key}-expand`,
                        }}
                      />
                      <Td dataLabel={t("amfaSignalColumn")}>
                        {t(s.label)}{" "}
                        <HelpItem helpText={t(s.desc)} fieldLabelId={s.label} />
                      </Td>
                      <Td dataLabel={t("amfaStatusColumn")}>
                        {enableSwitch(`${s.key}.0.isDisabled`)}
                      </Td>
                      <Td dataLabel={t("amfaWeightColumn")}>
                        {weightSelect(`${s.key}.0.weight`)}
                      </Td>
                    </Tr>
                    <Tr isExpanded={open}>
                      <Td colSpan={4}>
                        <ExpandableRowContent>
                          {editorFor(s.key)}
                        </ExpandableRowContent>
                      </Td>
                    </Tr>
                  </Tbody>
                );
              })}
            </Table>
          </FormSection>

          <FormSection title={t("amfaScoring")} titleElement="h2">
            <FormGroup
              label={t("scoringMode")}
              fieldId="scoringMode"
              labelIcon={
                <HelpItem
                  helpText={t("adaptive-mfa-risk-scoring-description")}
                  fieldLabelId="scoringMode"
                />
              }
            >
              <FormSelect
                id="scoringMode"
                value={scoringMode}
                onChange={(_event, value) => setScoringMode(value)}
              >
                <FormSelectOption value="weight" label={t("scoringModeWeight")} />
                <FormSelectOption
                  value="bayesian"
                  label={t("scoringModeBayesian")}
                />
              </FormSelect>
            </FormGroup>
            {scoringMode === "bayesian" && (
              <>
                <FormGroup label={t("scoringBias")} fieldId="scoring-bias">
                  <TextInput
                    id="scoring-bias"
                    type="number"
                    placeholder="-3.9"
                    value={scoringBias}
                    onChange={(_event, value) => setScoringBias(value)}
                  />
                </FormGroup>
                <FormGroup
                  label={t("scoringThresholds")}
                  fieldId="scoring-thresholds"
                >
                  <TextInput
                    id="scoring-thresholds"
                    placeholder="0.3, 0.6, 0.85"
                    value={scoringThresholds}
                    onChange={(_event, value) => setScoringThresholds(value)}
                  />
                </FormGroup>
              </>
            )}
          </FormSection>

          <ActionGroup>
            <Button
              type="submit"
              variant="primary"
              isDisabled={configLoadFailed}
              data-testid="amfa-save"
            >
              {t("save")}
            </Button>
            {/* A disabled button with no explanation is its own confusion, and the
                error alert has long since auto-dismissed by the time anyone looks. */}
            {configLoadFailed && (
              <div
                data-testid="amfa-save-blocked"
                style={{
                  fontSize: "13px",
                  color: "var(--pf-v5-global--danger-color--100)",
                  alignSelf: "center",
                }}
              >
                {t("amfaSaveBlockedLoadFailed")}
              </div>
            )}
          </ActionGroup>
        </>
      )}
    </Form>
    </FormProvider>
  );
}
