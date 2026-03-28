#include "PrintFarmPanel.hpp"
#include "GUI_App.hpp"
#include "MainFrame.hpp"
#include "Notebook.hpp"
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
#include <wx/stdpaths.h>
#include <wx/filename.h>

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
                m_server_running = true;
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
    wxStaticText* title = new wxStaticText(m_setup_panel, wxID_ANY, _L("LUGOWARE PrintFarm"));
    title->SetForegroundColour(wxColour(0, 190, 170));
    wxFont title_font = title->GetFont();
    title_font.SetPointSize(24);
    title_font.SetWeight(wxFONTWEIGHT_BOLD);
    title->SetFont(title_font);
    setup_sizer->Add(title, 0, wxALIGN_CENTER | wxBOTTOM, 10);

    wxStaticText* subtitle = new wxStaticText(m_setup_panel, wxID_ANY, _L("Choose how to connect to PrintFarm"));
    subtitle->SetForegroundColour(wxColour(180, 180, 180));
    wxFont subtitle_font = subtitle->GetFont();
    subtitle_font.SetPointSize(12);
    subtitle->SetFont(subtitle_font);
    setup_sizer->Add(subtitle, 0, wxALIGN_CENTER | wxBOTTOM, 40);

    // Two cards side by side
    wxBoxSizer* cards_sizer = new wxBoxSizer(wxHORIZONTAL);
    cards_sizer->AddStretchSpacer(1);

    // --- Server Card (Left) ---
    wxPanel* server_card = new wxPanel(m_setup_panel, wxID_ANY, wxDefaultPosition, wxSize(350, 320));
    server_card->SetBackgroundColour(wxColour(50, 55, 65));
    wxBoxSizer* server_sizer = new wxBoxSizer(wxVERTICAL);

    wxStaticText* server_icon = new wxStaticText(server_card, wxID_ANY, wxString::FromUTF8("\xF0\x9F\x96\xA5"));
    wxFont icon_font = server_icon->GetFont();
    icon_font.SetPointSize(36);
    server_icon->SetFont(icon_font);
    server_sizer->Add(server_icon, 0, wxALIGN_CENTER | wxTOP, 25);

    wxStaticText* server_title = new wxStaticText(server_card, wxID_ANY, _L("Run as Server"));
    server_title->SetForegroundColour(*wxWHITE);
    wxFont card_title_font = server_title->GetFont();
    card_title_font.SetPointSize(14);
    card_title_font.SetWeight(wxFONTWEIGHT_BOLD);
    server_title->SetFont(card_title_font);
    server_sizer->Add(server_title, 0, wxALIGN_CENTER | wxTOP, 10);

    wxStaticText* server_desc = new wxStaticText(server_card, wxID_ANY, _L("Host PrintFarm on this PC"));
    server_desc->SetForegroundColour(wxColour(150, 150, 150));
    server_sizer->Add(server_desc, 0, wxALIGN_CENTER | wxBOTTOM, 15);

    m_start_server_btn = new wxButton(server_card, wxID_ANY, _L("Start Server"),
        wxDefaultPosition, wxSize(250, 38));
    m_start_server_btn->SetBackgroundColour(wxColour(0, 190, 170));
    m_start_server_btn->SetForegroundColour(*wxWHITE);
    wxFont btn_font = m_start_server_btn->GetFont();
    btn_font.SetPointSize(11);
    btn_font.SetWeight(wxFONTWEIGHT_BOLD);
    m_start_server_btn->SetFont(btn_font);
    server_sizer->Add(m_start_server_btn, 0, wxALIGN_CENTER | wxTOP, 15);

    server_sizer->AddSpacer(20);

    server_card->SetSizer(server_sizer);
    cards_sizer->Add(server_card, 0, wxRIGHT, 20);

    // --- Client Card (Right) ---
    wxPanel* client_card = new wxPanel(m_setup_panel, wxID_ANY, wxDefaultPosition, wxSize(350, 320));
    client_card->SetBackgroundColour(wxColour(50, 55, 65));
    wxBoxSizer* client_sizer = new wxBoxSizer(wxVERTICAL);

    wxStaticText* client_icon = new wxStaticText(client_card, wxID_ANY, wxString::FromUTF8("\xF0\x9F\x8C\x90"));
    client_icon->SetFont(icon_font);
    client_sizer->Add(client_icon, 0, wxALIGN_CENTER | wxTOP, 25);

    wxStaticText* client_title = new wxStaticText(client_card, wxID_ANY, _L("Connect as Client"));
    client_title->SetForegroundColour(*wxWHITE);
    client_title->SetFont(card_title_font);
    client_sizer->Add(client_title, 0, wxALIGN_CENTER | wxTOP, 10);

    wxStaticText* client_desc = new wxStaticText(client_card, wxID_ANY, _L("Connect to an existing server"));
    client_desc->SetForegroundColour(wxColour(150, 150, 150));
    client_sizer->Add(client_desc, 0, wxALIGN_CENTER | wxBOTTOM, 15);

    wxStaticText* url_label = new wxStaticText(client_card, wxID_ANY, _L("Server URL:"));
    url_label->SetForegroundColour(wxColour(180, 180, 180));
    client_sizer->Add(url_label, 0, wxLEFT, 25);

    m_server_url_input = new wxTextCtrl(client_card, wxID_ANY, "http://",
        wxDefaultPosition, wxSize(300, 28));
    client_sizer->Add(m_server_url_input, 0, wxALIGN_CENTER | wxTOP | wxBOTTOM, 5);

    wxButton* connect_btn = new wxButton(client_card, wxID_ANY, _L("Connect"),
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
    m_start_server_btn->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) {
        on_start_server();
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

void PrintFarmPanel::on_start_server()
{
    // Show loading overlay
    m_setup_panel->Disable();
    wxWindowUpdateLocker lock(this);

    // Save config
    auto* config = wxGetApp().app_config;
    config->set("printfarm_mode", "server");
    config->set("printfarm_url", "http://localhost:46259");
    config->save();

    m_setup_done = true;

    // Ensure .env exists
    try {
        boost::filesystem::path appdata_dir;
#ifdef _WIN32
        const char* appdata = std::getenv("APPDATA");
        if (appdata)
            appdata_dir = boost::filesystem::path(appdata) / "LugowareOrcaSlicer" / "printfarm";
#else
        const char* home = std::getenv("HOME");
        if (home)
            appdata_dir = boost::filesystem::path(home) / ".LugowareOrcaSlicer" / "printfarm";
#endif
        if (!appdata_dir.empty()) {
            boost::filesystem::path env_file = appdata_dir / "server" / ".env";
            if (!boost::filesystem::exists(env_file)) {
                boost::filesystem::create_directories(env_file.parent_path());
                std::ofstream ofs(env_file.string());
                if (ofs.is_open()) {
                    ofs << "PORT=46259" << std::endl;
                    ofs << "JWT_SECRET=lugoware-printfarm-secret-key" << std::endl;
                    ofs.close();
                    BOOST_LOG_TRIVIAL(info) << "PrintFarm: Created default .env at " << env_file.string();
                }
            }
        }
    } catch (const std::exception& e) {
        BOOST_LOG_TRIVIAL(warning) << "PrintFarm: .env check failed: " << e.what();
    }

    // Start the server
    start_server();
    m_server_running = true;
    update_tab_label();

    // Show loading spinner overlay
    wxPanel* overlay = new wxPanel(this, wxID_ANY, wxPoint(0, 0), GetSize());
    overlay->SetBackgroundColour(wxColour(40, 44, 52));
    overlay->SetTransparent(200);

    wxBoxSizer* overlay_sizer = new wxBoxSizer(wxVERTICAL);
    overlay_sizer->AddStretchSpacer(1);

    wxStaticText* loading_text = new wxStaticText(overlay, wxID_ANY, _L("Starting server..."));
    loading_text->SetForegroundColour(wxColour(0, 190, 170));
    wxFont loading_font = loading_text->GetFont();
    loading_font.SetPointSize(16);
    loading_font.SetWeight(wxFONTWEIGHT_BOLD);
    loading_text->SetFont(loading_font);
    overlay_sizer->Add(loading_text, 0, wxALIGN_CENTER);

    wxStaticText* spinner = new wxStaticText(overlay, wxID_ANY, wxString::FromUTF8("\xE2\x8F\xB3"));
    wxFont spinner_font = spinner->GetFont();
    spinner_font.SetPointSize(32);
    spinner->SetFont(spinner_font);
    overlay_sizer->Add(spinner, 0, wxALIGN_CENTER | wxTOP, 10);

    overlay_sizer->AddStretchSpacer(1);
    overlay->SetSizer(overlay_sizer);
    overlay->Raise();
    overlay->Layout();
    overlay->Update();
    wxYield();

    // Wait for server to be ready
    wxMilliSleep(3000);

    // Remove overlay and show webview
    overlay->Destroy();
    m_setup_panel->Enable();

    show_webview();
    load_url("http://localhost:46259");
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
            appdata_dir = boost::filesystem::path(appdata) / "LugowareOrcaSlicer" / "printfarm";
        } else {
            BOOST_LOG_TRIVIAL(error) << "PrintFarm: APPDATA not found for server start";
            return;
        }

        boost::filesystem::path node_exe = appdata_dir / "node" / "node.exe";
        boost::filesystem::path index_js = appdata_dir / "server" / "src" / "index.js";

        if (boost::filesystem::exists(node_exe) && boost::filesystem::exists(index_js)) {
            wxString command = wxString::Format("\"%s\" \"%s\"", node_exe.string(), index_js.string());
            BOOST_LOG_TRIVIAL(info) << "PrintFarm: Starting server with: " << command.ToStdString();
            wxExecute(command, wxEXEC_ASYNC | wxEXEC_HIDE_CONSOLE);
        } else {
            BOOST_LOG_TRIVIAL(warning) << "PrintFarm: Server files not found. node="
                << node_exe.string() << " index=" << index_js.string();
        }

#else
        const char* home = std::getenv("HOME");
        if (home) {
            appdata_dir = boost::filesystem::path(home) / ".LugowareOrcaSlicer" / "printfarm";
        } else {
            BOOST_LOG_TRIVIAL(error) << "PrintFarm: HOME not found for server start";
            return;
        }

        boost::filesystem::path node_exe = appdata_dir / "node" / "node";
        boost::filesystem::path index_js = appdata_dir / "server" / "src" / "index.js";

        if (boost::filesystem::exists(node_exe) && boost::filesystem::exists(index_js)) {
            wxString command = wxString::Format("\"%s\" \"%s\"", node_exe.string(), index_js.string());
            BOOST_LOG_TRIVIAL(info) << "PrintFarm: Starting server with: " << command.ToStdString();
            wxExecute(command, wxEXEC_ASYNC);
        } else {
            BOOST_LOG_TRIVIAL(warning) << "PrintFarm: Server files not found in " << appdata_dir.string();
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

bool PrintFarmPanel::is_server_mode() const
{
    auto* config = wxGetApp().app_config;
    return config && config->get("printfarm_mode") == "server";
}

void PrintFarmPanel::toggle_server()
{
    if (!m_toggle_enabled)
        return;

    if (m_server_running) {
        stop_server();
        m_server_running = false;
        show_setup();
        BOOST_LOG_TRIVIAL(info) << "PrintFarm: Server stopped by toggle";
    } else {
        auto* config = wxGetApp().app_config;
        config->set("printfarm_mode", "server");
        config->set("printfarm_url", "http://localhost:46259");
        config->save();

        start_server();
        m_server_running = true;
        BOOST_LOG_TRIVIAL(info) << "PrintFarm: Server started by toggle";

        wxMilliSleep(2000);
        show_webview();
        load_url("http://localhost:46259");
    }
    update_tab_label();
}

void PrintFarmPanel::stop_server()
{
    try {
#ifdef _WIN32
        // Kill node.exe processes started by PrintFarm
        wxExecute("taskkill /IM node.exe /F", wxEXEC_SYNC | wxEXEC_HIDE_CONSOLE);
        BOOST_LOG_TRIVIAL(info) << "PrintFarm: Killed node.exe processes";
#else
        wxExecute("pkill -f 'node.*server.js'", wxEXEC_SYNC);
        BOOST_LOG_TRIVIAL(info) << "PrintFarm: Killed node server processes";
#endif
    } catch (const std::exception& e) {
        BOOST_LOG_TRIVIAL(error) << "PrintFarm: Failed to stop server: " << e.what();
    }
}

void PrintFarmPanel::shutdown_server()
{
    if (m_server_running) {
        stop_server();
        m_server_running = false;
        BOOST_LOG_TRIVIAL(info) << "PrintFarm: Server shutdown on app exit";
    }
}

void PrintFarmPanel::update_tab_label()
{
    auto* main_frame = dynamic_cast<MainFrame*>(wxGetApp().mainframe);
    if (!main_frame)
        return;

    auto* tabpanel = main_frame->get_tabpanel();
    if (!tabpanel)
        return;

    // Find the PrintFarm tab index
    for (size_t i = 0; i < tabpanel->GetPageCount(); i++) {
        if (tabpanel->GetPage(i) == this) {
            wxString label;
            if (is_server_mode()) {
                label = m_server_running ? _L("PrintFarm [ON]") : _L("PrintFarm [OFF]");
            } else {
                label = _L("PrintFarm");
            }
            tabpanel->SetPageText(i, label);
            // ON = orange, OFF/default = white
            if (m_server_running) {
                tabpanel->SetPageTextColor(i, wxColour(255, 165, 0));
            } else {
                tabpanel->SetPageTextColor(i, wxColour(254, 254, 254));
            }
            break;
        }
    }
}

} // namespace GUI
} // namespace Slic3r
