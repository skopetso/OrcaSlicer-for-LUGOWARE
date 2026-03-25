#include "PrintFarmPanel.hpp"
#include "GUI_App.hpp"
#include "MainFrame.hpp"
#include "libslic3r/AppConfig.hpp"
#include "slic3r/Utils/Http.hpp"

#include <boost/filesystem.hpp>
#include <boost/log/trivial.hpp>

#include <wx/radiobut.h>
#include <wx/stattext.h>
#include <wx/textctrl.h>
#include <wx/button.h>
#include <wx/sizer.h>
#include <wx/font.h>
#include <wx/wfstream.h>

#include <fstream>

namespace Slic3r {
namespace GUI {

PrintFarmPanel::PrintFarmPanel(wxWindow* parent)
    : wxPanel(parent, wxID_ANY)
{
    SetBackgroundColour(wxColour(40, 44, 52));

    m_main_sizer = new wxBoxSizer(wxVERTICAL);

    // Create setup panel
    build_setup_page();

    // Create webview
    m_webview = new PrinterWebView(this);
    m_main_sizer->Add(m_webview, 1, wxEXPAND);
    m_webview->Hide();

    SetSizer(m_main_sizer);

    // Check config to decide which panel to show
    auto* config = wxGetApp().app_config;
    std::string mode = config->get("printfarm_mode");

    if (mode == "server" || mode == "client") {
        m_setup_done = true;
        std::string url = config->get("printfarm_url");
        if (!url.empty()) {
            show_webview();
            if (mode == "server") {
                start_server();
            }
            load_url(wxString(url));
        } else {
            show_setup();
        }
    } else {
        show_setup();
    }
}

void PrintFarmPanel::build_setup_page()
{
    m_setup_panel = new wxPanel(this, wxID_ANY);
    m_setup_panel->SetBackgroundColour(wxColour(40, 44, 52));

    wxBoxSizer* setup_sizer = new wxBoxSizer(wxVERTICAL);
    setup_sizer->AddStretchSpacer(1);

    // Title
    wxStaticText* title = new wxStaticText(m_setup_panel, wxID_ANY, "LUGOWARE PrintFarm");
    title->SetForegroundColour(wxColour(0, 190, 170));
    wxFont title_font = title->GetFont();
    title_font.SetPointSize(24);
    title_font.SetWeight(wxFONTWEIGHT_BOLD);
    title->SetFont(title_font);
    setup_sizer->Add(title, 0, wxALIGN_CENTER | wxBOTTOM, 10);

    wxStaticText* subtitle = new wxStaticText(m_setup_panel, wxID_ANY, "Choose how to connect to PrintFarm");
    subtitle->SetForegroundColour(wxColour(180, 180, 180));
    wxFont subtitle_font = subtitle->GetFont();
    subtitle_font.SetPointSize(12);
    subtitle->SetFont(subtitle_font);
    setup_sizer->Add(subtitle, 0, wxALIGN_CENTER | wxBOTTOM, 40);

    // Two cards side by side
    wxBoxSizer* cards_sizer = new wxBoxSizer(wxHORIZONTAL);
    cards_sizer->AddStretchSpacer(1);

    // --- Server Card (Left) ---
    wxPanel* server_card = new wxPanel(m_setup_panel, wxID_ANY, wxDefaultPosition, wxSize(350, 450));
    server_card->SetBackgroundColour(wxColour(50, 55, 65));
    wxBoxSizer* server_sizer = new wxBoxSizer(wxVERTICAL);

    wxStaticText* server_icon = new wxStaticText(server_card, wxID_ANY, wxString::FromUTF8("\xF0\x9F\x96\xA5"));
    wxFont icon_font = server_icon->GetFont();
    icon_font.SetPointSize(36);
    server_icon->SetFont(icon_font);
    server_sizer->Add(server_icon, 0, wxALIGN_CENTER | wxTOP, 20);

    wxStaticText* server_title = new wxStaticText(server_card, wxID_ANY, "Run as Server");
    server_title->SetForegroundColour(*wxWHITE);
    wxFont card_title_font = server_title->GetFont();
    card_title_font.SetPointSize(14);
    card_title_font.SetWeight(wxFONTWEIGHT_BOLD);
    server_title->SetFont(card_title_font);
    server_sizer->Add(server_title, 0, wxALIGN_CENTER | wxTOP, 8);

    wxStaticText* server_desc = new wxStaticText(server_card, wxID_ANY, "Host PrintFarm on this PC");
    server_desc->SetForegroundColour(wxColour(150, 150, 150));
    server_sizer->Add(server_desc, 0, wxALIGN_CENTER | wxBOTTOM, 12);

    wxFont label_font = server_desc->GetFont();

    // Storage Path
    wxStaticText* storage_label = new wxStaticText(server_card, wxID_ANY, "Storage Path:");
    storage_label->SetForegroundColour(wxColour(180, 180, 180));
    server_sizer->Add(storage_label, 0, wxLEFT, 25);

    wxString default_storage = wxString::Format("C:/Users/%s/PrintFarm/storage", wxGetUserId());
    m_storage_path_input = new wxTextCtrl(server_card, wxID_ANY, default_storage,
        wxDefaultPosition, wxSize(300, 26));
    server_sizer->Add(m_storage_path_input, 0, wxALIGN_CENTER | wxTOP | wxBOTTOM, 3);

    // Admin Username
    wxStaticText* user_label = new wxStaticText(server_card, wxID_ANY, "Admin Username:");
    user_label->SetForegroundColour(wxColour(180, 180, 180));
    server_sizer->Add(user_label, 0, wxLEFT | wxTOP, 25);

    m_admin_username = new wxTextCtrl(server_card, wxID_ANY, "admin",
        wxDefaultPosition, wxSize(300, 26));
    server_sizer->Add(m_admin_username, 0, wxALIGN_CENTER | wxTOP | wxBOTTOM, 3);

    // Admin Password
    wxStaticText* pass_label = new wxStaticText(server_card, wxID_ANY, "Admin Password:");
    pass_label->SetForegroundColour(wxColour(180, 180, 180));
    server_sizer->Add(pass_label, 0, wxLEFT, 25);

    m_admin_password = new wxTextCtrl(server_card, wxID_ANY, "",
        wxDefaultPosition, wxSize(300, 26), wxTE_PASSWORD);
    server_sizer->Add(m_admin_password, 0, wxALIGN_CENTER | wxTOP | wxBOTTOM, 3);

    // Confirm Password
    wxStaticText* confirm_label = new wxStaticText(server_card, wxID_ANY, "Confirm Password:");
    confirm_label->SetForegroundColour(wxColour(180, 180, 180));
    server_sizer->Add(confirm_label, 0, wxLEFT, 25);

    m_admin_password_confirm = new wxTextCtrl(server_card, wxID_ANY, "",
        wxDefaultPosition, wxSize(300, 26), wxTE_PASSWORD);
    server_sizer->Add(m_admin_password_confirm, 0, wxALIGN_CENTER | wxTOP | wxBOTTOM, 3);

    wxButton* install_btn = new wxButton(server_card, wxID_ANY, "Install && Start Server",
        wxDefaultPosition, wxSize(250, 38));
    install_btn->SetBackgroundColour(wxColour(0, 190, 170));
    install_btn->SetForegroundColour(*wxWHITE);
    wxFont btn_font = install_btn->GetFont();
    btn_font.SetPointSize(11);
    btn_font.SetWeight(wxFONTWEIGHT_BOLD);
    install_btn->SetFont(btn_font);
    server_sizer->Add(install_btn, 0, wxALIGN_CENTER | wxTOP, 12);

    server_card->SetSizer(server_sizer);
    cards_sizer->Add(server_card, 0, wxRIGHT, 20);

    // --- Client Card (Right) ---
    wxPanel* client_card = new wxPanel(m_setup_panel, wxID_ANY, wxDefaultPosition, wxSize(350, 320));
    client_card->SetBackgroundColour(wxColour(50, 55, 65));
    wxBoxSizer* client_sizer = new wxBoxSizer(wxVERTICAL);

    wxStaticText* client_icon = new wxStaticText(client_card, wxID_ANY, wxString::FromUTF8("\xF0\x9F\x8C\x90"));
    client_icon->SetFont(icon_font);
    client_sizer->Add(client_icon, 0, wxALIGN_CENTER | wxTOP, 25);

    wxStaticText* client_title = new wxStaticText(client_card, wxID_ANY, "Connect as Client");
    client_title->SetForegroundColour(*wxWHITE);
    client_title->SetFont(card_title_font);
    client_sizer->Add(client_title, 0, wxALIGN_CENTER | wxTOP, 10);

    wxStaticText* client_desc = new wxStaticText(client_card, wxID_ANY, "Connect to an existing server");
    client_desc->SetForegroundColour(wxColour(150, 150, 150));
    client_sizer->Add(client_desc, 0, wxALIGN_CENTER | wxBOTTOM, 15);

    wxStaticText* url_label = new wxStaticText(client_card, wxID_ANY, "Server URL:");
    url_label->SetForegroundColour(wxColour(180, 180, 180));
    client_sizer->Add(url_label, 0, wxLEFT, 25);

    m_server_url_input = new wxTextCtrl(client_card, wxID_ANY, "http://192.168.0.46:46259",
        wxDefaultPosition, wxSize(300, 28));
    client_sizer->Add(m_server_url_input, 0, wxALIGN_CENTER | wxTOP | wxBOTTOM, 5);

    wxButton* connect_btn = new wxButton(client_card, wxID_ANY, "Connect",
        wxDefaultPosition, wxSize(250, 38));
    connect_btn->SetBackgroundColour(wxColour(0, 190, 170));
    connect_btn->SetForegroundColour(*wxWHITE);
    connect_btn->SetFont(btn_font);
    client_sizer->Add(connect_btn, 0, wxALIGN_CENTER | wxTOP, 15);

    client_card->SetSizer(client_sizer);
    cards_sizer->Add(client_card, 0);

    cards_sizer->AddStretchSpacer(1);
    setup_sizer->Add(cards_sizer, 0, wxEXPAND);

    setup_sizer->AddStretchSpacer(1);
    m_setup_panel->SetSizer(setup_sizer);
    m_main_sizer->Add(m_setup_panel, 1, wxEXPAND);

    // --- Event bindings ---
    install_btn->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) {
        on_server_install();
    });

    connect_btn->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) {
        on_client_connect();
    });
}

void PrintFarmPanel::show_setup()
{
    m_webview->Hide();
    m_setup_panel->Show();
    m_main_sizer->Layout();
}

void PrintFarmPanel::show_webview()
{
    m_setup_panel->Hide();
    m_webview->Show();
    m_main_sizer->Layout();
}

void PrintFarmPanel::on_server_install()
{
    // Validate admin credentials
    wxString username = m_admin_username->GetValue();
    wxString password = m_admin_password->GetValue();
    wxString password_confirm = m_admin_password_confirm->GetValue();

    if (username.IsEmpty()) {
        wxMessageBox("Please enter an admin username.", "Error", wxICON_ERROR);
        return;
    }
    if (password.IsEmpty()) {
        wxMessageBox("Please enter an admin password.", "Error", wxICON_ERROR);
        return;
    }
    if (password != password_confirm) {
        wxMessageBox("Passwords do not match.", "Error", wxICON_ERROR);
        return;
    }
    if (password.Length() < 4) {
        wxMessageBox("Password must be at least 4 characters.", "Error", wxICON_ERROR);
        return;
    }

    wxString storage_path = m_storage_path_input->GetValue();
    if (storage_path.IsEmpty()) {
        storage_path = "C:/PrintFarm/storage";
    }

    try {
        // Determine source and destination paths
        boost::filesystem::path resources_dir = boost::filesystem::path(Slic3r::resources_dir()) / "printfarm";
        boost::filesystem::path appdata_dir;

#ifdef _WIN32
        const char* appdata = std::getenv("APPDATA");
        if (appdata) {
            appdata_dir = boost::filesystem::path(appdata) / "printfarm";
        } else {
            BOOST_LOG_TRIVIAL(error) << "PrintFarm: APPDATA environment variable not found";
            return;
        }
#else
        const char* home = std::getenv("HOME");
        if (home) {
            appdata_dir = boost::filesystem::path(home) / ".printfarm";
        } else {
            BOOST_LOG_TRIVIAL(error) << "PrintFarm: HOME environment variable not found";
            return;
        }
#endif

        // Create destination directory
        if (!boost::filesystem::exists(appdata_dir)) {
            boost::filesystem::create_directories(appdata_dir);
        }

        // Copy printfarm resources to appdata
        if (boost::filesystem::exists(resources_dir)) {
            for (auto& entry : boost::filesystem::recursive_directory_iterator(resources_dir)) {
                boost::filesystem::path relative = boost::filesystem::relative(entry.path(), resources_dir);
                boost::filesystem::path dest = appdata_dir / relative;

                if (boost::filesystem::is_directory(entry.path())) {
                    boost::filesystem::create_directories(dest);
                } else {
                    boost::filesystem::create_directories(dest.parent_path());
                    boost::filesystem::copy_file(entry.path(), dest,
                        boost::filesystem::copy_option::overwrite_if_exists);
                }
            }
            BOOST_LOG_TRIVIAL(info) << "PrintFarm: Copied resources to " << appdata_dir.string();
        } else {
            BOOST_LOG_TRIVIAL(warning) << "PrintFarm: Resources directory not found: " << resources_dir.string();
        }

        // Create storage directory
        boost::filesystem::path storage_dir(storage_path.ToStdString());
        if (!boost::filesystem::exists(storage_dir)) {
            boost::filesystem::create_directories(storage_dir);
        }

        // Create .env file
        boost::filesystem::path env_file = appdata_dir / ".env";
        {
            std::ofstream ofs(env_file.string());
            if (ofs.is_open()) {
                ofs << "JWT_SECRET=lugoware-printfarm-secret-key" << std::endl;
                ofs << "PORT=46259" << std::endl;
                ofs << "STORAGE_PATH=" << storage_path.ToStdString() << std::endl;
                ofs.close();
                BOOST_LOG_TRIVIAL(info) << "PrintFarm: Created .env file at " << env_file.string();
            } else {
                BOOST_LOG_TRIVIAL(error) << "PrintFarm: Failed to create .env file";
            }
        }

        // Save config
        auto* config = wxGetApp().app_config;
        config->set("printfarm_mode", "server");
        config->set("printfarm_url", "http://localhost:46259");
        config->set("printfarm_storage", storage_path.ToStdString());
        config->save();

        m_setup_done = true;

        // Start the server
        start_server();

        // Wait for server to be ready
        wxMilliSleep(3000);

        // Register admin account
        {
            Slic3r::Http http = Slic3r::Http::post("http://localhost:46259/api/auth/register");
            http.header("Content-Type", "application/json");
            std::string body = "{\"username\":\"" + username.ToStdString() + "\",\"password\":\"" + password.ToStdString() + "\"}";
            http.set_post_body(body);
            http.on_complete([](std::string body, unsigned status) {
                BOOST_LOG_TRIVIAL(info) << "PrintFarm: Admin registered, status=" << status;
            }).on_error([](std::string body, std::string error, unsigned status) {
                BOOST_LOG_TRIVIAL(warning) << "PrintFarm: Admin register failed: " << error << " body=" << body;
            }).perform_sync();
        }

        // Configure storage path
        {
            Slic3r::Http http = Slic3r::Http::put("http://localhost:46259/api/storage/config");
            http.header("Content-Type", "application/json");
            std::string body = "{\"storagePath\":\"" + storage_path.ToStdString() + "\"}";
            http.set_post_body(body);
            http.on_complete([](std::string body, unsigned status) {
                BOOST_LOG_TRIVIAL(info) << "PrintFarm: Storage configured, status=" << status;
            }).on_error([](std::string body, std::string error, unsigned status) {
                BOOST_LOG_TRIVIAL(warning) << "PrintFarm: Storage config failed: " << error;
            }).perform_sync();
        }

        // Show the webview
        show_webview();
        load_url("http://localhost:46259");

    } catch (const std::exception& e) {
        BOOST_LOG_TRIVIAL(error) << "PrintFarm: Installation failed: " << e.what();
    }
}

void PrintFarmPanel::on_client_connect()
{
    wxString url = m_server_url_input->GetValue();
    if (url.IsEmpty()) {
        url = "http://192.168.0.46:46259";
    }

    // Save config
    auto* config = wxGetApp().app_config;
    config->set("printfarm_mode", "client");
    config->set("printfarm_url", url.ToStdString());
    config->save();

    m_setup_done = true;

    // Show webview and load URL
    show_webview();
    load_url(url);
}

void PrintFarmPanel::start_server()
{
    try {
        boost::filesystem::path appdata_dir;

#ifdef _WIN32
        const char* appdata = std::getenv("APPDATA");
        if (appdata) {
            appdata_dir = boost::filesystem::path(appdata) / "printfarm";
        } else {
            BOOST_LOG_TRIVIAL(error) << "PrintFarm: APPDATA not found for server start";
            return;
        }

        // Try start.bat first, then node.exe
        boost::filesystem::path start_bat = appdata_dir / "start.bat";
        boost::filesystem::path node_exe = appdata_dir / "node.exe";
        boost::filesystem::path server_js = appdata_dir / "server.js";

        wxString command;
        if (boost::filesystem::exists(start_bat)) {
            command = wxString::Format("cmd /c \"\"%s\"\"", start_bat.string());
        } else if (boost::filesystem::exists(node_exe) && boost::filesystem::exists(server_js)) {
            command = wxString::Format("\"%s\" \"%s\"", node_exe.string(), server_js.string());
        } else {
            BOOST_LOG_TRIVIAL(warning) << "PrintFarm: No start.bat or node.exe found in " << appdata_dir.string();
            return;
        }

        BOOST_LOG_TRIVIAL(info) << "PrintFarm: Starting server with: " << command.ToStdString();
        wxExecute(command, wxEXEC_ASYNC | wxEXEC_HIDE_CONSOLE);

#else
        const char* home = std::getenv("HOME");
        if (home) {
            appdata_dir = boost::filesystem::path(home) / ".printfarm";
        } else {
            BOOST_LOG_TRIVIAL(error) << "PrintFarm: HOME not found for server start";
            return;
        }

        boost::filesystem::path node_exe = appdata_dir / "node";
        boost::filesystem::path server_js = appdata_dir / "server.js";

        if (boost::filesystem::exists(node_exe) && boost::filesystem::exists(server_js)) {
            wxString command = wxString::Format("\"%s\" \"%s\"", node_exe.string(), server_js.string());
            BOOST_LOG_TRIVIAL(info) << "PrintFarm: Starting server with: " << command.ToStdString();
            wxExecute(command, wxEXEC_ASYNC);
        } else {
            BOOST_LOG_TRIVIAL(warning) << "PrintFarm: No node executable found in " << appdata_dir.string();
        }
#endif

    } catch (const std::exception& e) {
        BOOST_LOG_TRIVIAL(error) << "PrintFarm: Failed to start server: " << e.what();
    }
}

void PrintFarmPanel::load_url(const wxString& url)
{
    if (m_webview) {
        wxString mutable_url = url;
        m_webview->load_url(mutable_url);
        BOOST_LOG_TRIVIAL(info) << "PrintFarm: Loading URL: " << url.ToStdString();
    }
}

} // namespace GUI
} // namespace Slic3r
