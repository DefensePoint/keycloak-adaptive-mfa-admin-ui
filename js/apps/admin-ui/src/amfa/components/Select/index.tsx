import {
  FormGroup,
  SelectOption,
  SelectProps,
} from "@patternfly/react-core";
import { KeycloakSelect, SelectVariant } from "@keycloak/keycloak-ui-shared";

import { useState } from "react";

import {
  FieldValues,
  UseControllerProps,
  useController,
} from "react-hook-form";

type SingleSelectProps<T extends FieldValues> = UseControllerProps<T> & {
  label?: string;
  options: {
    label: string;
    value: string;
  }[];
  onAfterItemChange?: (value: string) => void;
} & Partial<SelectProps>;

export default function SingleSelect<T extends FieldValues>({
  options,
  label,
  name,
  onAfterItemChange,
  ...controllerProps
}: SingleSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const {
    field: { onChange, value },
  } = useController({
    name,
    control: controllerProps.control,
    defaultValue: controllerProps.defaultValue,
    rules: controllerProps.rules,
    shouldUnregister: controllerProps.shouldUnregister,
  });

  const formattedOptions = [
    <SelectOption key={0} value="">
      Select an option
    </SelectOption>,
    ...options.map((option) => (
      <SelectOption key={option.label} value={option.value}>
        {option.label}
      </SelectOption>
    )),
  ];

  return (
    <FormGroup label={label}>
      <KeycloakSelect
        maxHeight={375}
        toggleId={`${name}-single`}
        variant={SelectVariant.single}
        menuAppendTo="parent"
        onToggle={(open) => setIsOpen(open)}
        isOpen={isOpen}
        selections={value || ""}
        onSelect={(selectedValue) => {
          onChange(selectedValue);
          onAfterItemChange?.(selectedValue as string);
          setIsOpen(false);
        }}
      >
        {formattedOptions}
      </KeycloakSelect>
    </FormGroup>
  );
}
