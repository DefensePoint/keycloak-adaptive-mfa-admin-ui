import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PageSection, Tab, Tabs, TabTitleText } from "@patternfly/react-core";

import type RealmRepresentation from "@keycloak/keycloak-admin-client/lib/defs/realmRepresentation";
import { HeadersForm } from "./HeadersForm";
import { BruteForceDetection } from "./BruteForceDetection";
import AdaptiveMFA from "../../amfa/pages/AdaptiveMFA/AdaptiveMFA";

type SecurityDefensesProps = {
  realm: RealmRepresentation;
  save: (realm: RealmRepresentation) => void;
};

export const SecurityDefenses = ({ realm, save }: SecurityDefensesProps) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState(10);
  // Counts the times the Adaptive MFA tab is opened. The tabs stay mounted once
  // opened, so without a new key the page would keep showing the settings it
  // loaded the first time, even after they were changed elsewhere.
  const [amfaOpened, setAmfaOpened] = useState(0);
  return (
    // Each tab mounts when first opened: the Adaptive MFA tab loads from the
    // AMFA engine, and its errors belong on that tab, not on the others.
    <Tabs
      mountOnEnter
      activeKey={activeTab}
      onSelect={(_, key) => {
        if (key === 30 && activeTab !== 30) {
          setAmfaOpened((n) => n + 1);
        }
        setActiveTab(key as number);
      }}
    >
      <Tab
        id="headers"
        eventKey={10}
        data-testid="security-defenses-headers-tab"
        title={<TabTitleText>{t("headers")}</TabTitleText>}
      >
        <PageSection variant="light">
          <HeadersForm realm={realm} save={save} />
        </PageSection>
      </Tab>
      <Tab
        id="bruteForce"
        eventKey={20}
        data-testid="security-defenses-brute-force-tab"
        title={<TabTitleText>{t("bruteForceDetection")}</TabTitleText>}
      >
        <PageSection variant="light">
          <BruteForceDetection realm={realm} save={save} />
        </PageSection>
      </Tab>
      <Tab
        id="adaptiveMFA"
        eventKey={30}
        title={<TabTitleText>{t("adaptiveMFA")}</TabTitleText>}
      >
        <PageSection variant="light">
          <AdaptiveMFA key={amfaOpened} />
        </PageSection>
      </Tab>
    </Tabs>
  );
};
