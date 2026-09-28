import {
  SelectOption,
  SelectProps,
} from "@patternfly/react-core";
import { KeycloakSelect, SelectVariant }from "@keycloak/keycloak-ui-shared";


import { useState } from "react";

import {
  FieldValues,
  UseControllerProps,
  useController,
} from "react-hook-form";

type MultipleSelectProps<T extends FieldValues> = UseControllerProps<T> & {
  label?: string;
  options: {
    label: string;
    value: string;
  }[];
  onAfterItemChange?: (value: string) => void;
} & Partial<SelectProps>;

export default function MultiSelect<T extends FieldValues>({
  options,
  label,
  name,
  ...controllerProps
}: MultipleSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const {
    field: { onChange, value },
  } = useController({
    name,
    control: controllerProps.control,
    defaultValue: controllerProps.defaultValue,
    rules: controllerProps.rules,
    shouldUnregister: controllerProps.shouldUnregister,
  });

  return (
    <KeycloakSelect
      maxHeight={375}
      toggleId={`${name}-multi`}
      variant={SelectVariant.typeaheadMulti}
      chipGroupProps={{
        numChips: 3,
      }}
      menuAppendTo="parent"
      onToggle={(open) => setIsOpen(open)}
      isOpen={isOpen}
      selections={value as string[]}
      placeholderText={label}
      onSelect={(selectedValue) => {
        const oldValue: string[] = value ? value : [];
        onChange(
          oldValue.find((item) => item === selectedValue)
            ? oldValue.filter((item) => item !== selectedValue)
            : [...oldValue, selectedValue],
        );
      }}
      onClear={() => {
        onChange([]);
      }}
      // KeycloakSelect's typeahead only reports the typed text — filtering
      // the rendered options is the caller's job.
      onFilter={setFilter}
    >
      {options
        .filter(
          (option) =>
            !filter ||
            option.label.toLowerCase().includes(filter.toLowerCase()),
        )
        .map((option) => (
          <SelectOption key={option.label} value={option.value}>
            {option.label}
          </SelectOption>
        ))}
    </KeycloakSelect>
  );
}
