import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Select } from "./Select";

function ControlledSelect() {
  const [value, setValue] = useState("b");
  return (
    <>
      <Select value={value} onChange={setValue}>
        <option value="a">Option A</option>
        <option value="b">Option B</option>
        <option value="c">Option C</option>
      </Select>
      <p>current: {value}</p>
    </>
  );
}

describe("Select", () => {
  it("shows the currently selected option's label on the closed trigger", () => {
    render(<ControlledSelect />);
    expect(screen.getByRole("button")).toHaveTextContent("Option B");
  });

  it("does not render a native <select> element (its popup can't be styled)", () => {
    const { container } = render(<ControlledSelect />);
    expect(container.querySelector("select")).toBeNull();
  });

  it("opens a custom listbox of options on click, not the OS-native dropdown", async () => {
    const user = userEvent.setup();
    render(<ControlledSelect />);
    await user.click(screen.getByRole("button"));

    const listbox = screen.getByRole("listbox");
    expect(listbox).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Option A" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Option C" })).toBeInTheDocument();
  });

  it("calls onChange with the plain string value and closes on selecting an option", async () => {
    const user = userEvent.setup();
    render(<ControlledSelect />);
    await user.click(screen.getByRole("button"));
    await user.click(screen.getByRole("option", { name: "Option C" }));

    expect(await screen.findByText("current: c")).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("closes when clicking outside", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <ControlledSelect />
        <button>outside</button>
      </div>,
    );
    await user.click(screen.getByRole("button", { name: /option b/i }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "outside" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(<ControlledSelect />);
    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("passes through name to the trigger for form libraries that read it", () => {
    render(
      <Select value="a" onChange={vi.fn()} name="paymentMethod">
        <option value="a">A</option>
      </Select>,
    );
    expect(screen.getByRole("button")).toHaveAttribute("name", "paymentMethod");
  });
});
