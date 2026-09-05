import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import LoginPage from "./LoginPage";
import { AuthContext } from "../../hooks/useAuth";

function renderLoginPage(login: (username: string, password: string) => Promise<void>) {
  return render(
    <AuthContext.Provider value={{ user: null, isLoading: false, login, logout: vi.fn(), changePassword: vi.fn() }}>
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div>Dashboard Home</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("LoginPage", () => {
  it("submits credentials and navigates home on success", async () => {
    const login = vi.fn().mockResolvedValue(undefined);
    const { container } = renderLoginPage(login);

    await userEvent.click(screen.getByRole("button", { name: /open sign in/i }));

    const [usernameInput] = container.querySelectorAll("input");
    const passwordInput = container.querySelector('input[type="password"]') as HTMLInputElement;

    await userEvent.type(usernameInput, "jdoe");
    await userEvent.type(passwordInput, "Str0ngPassw0rd!");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(login).toHaveBeenCalledWith("jdoe", "Str0ngPassw0rd!");
    expect(await screen.findByText("Dashboard Home")).toBeInTheDocument();
  });

  it("shows the server's error message when login fails", async () => {
    const login = vi.fn().mockRejectedValue({
      isAxiosError: true,
      response: { data: { detail: "Invalid username or password" } },
    });
    const { container } = renderLoginPage(login);

    await userEvent.click(screen.getByRole("button", { name: /open sign in/i }));

    const [usernameInput] = container.querySelectorAll("input");
    const passwordInput = container.querySelector('input[type="password"]') as HTMLInputElement;

    await userEvent.type(usernameInput, "jdoe");
    await userEvent.type(passwordInput, "wrong");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText("Invalid username or password")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard Home")).not.toBeInTheDocument();
  });
});
