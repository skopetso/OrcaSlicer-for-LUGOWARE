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
#include <wx/statbmp.h>
#include "BitmapCache.hpp"
#include <wx/font.h>
#include <wx/wfstream.h>
#include <wx/stdpaths.h>
#include <wx/filename.h>

#include <fstream>
#include <chrono>

namespace Slic3r {
namespace GUI {

PrintFarmPanel::PrintFarmPanel(wxWindow* parent)
    : wxPanel(parent, wxID_ANY)
{
    SetBackgroundColour(wxColour(40, 44, 52));

    m_main_sizer = new wxBoxSizer(wxVERTICAL);

    // Create setup panel
    build_setup_page();

    // Create server toolbar (shown when server is running)
    m_server_toolbar = new wxPanel(this, wxID_ANY);
    m_server_toolbar->SetBackgroundColour(wxColour(30, 33, 40));
    auto* tb_sizer = new wxBoxSizer(wxHORIZONTAL);
    tb_sizer->AddStretchSpacer();
    wxFont btn_font_sm = wxFont(9, wxFONTFAMILY_DEFAULT, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_BOLD);
    m_restart_btn = new wxButton(m_server_toolbar, wxID_ANY, _L("Restart Server"), wxDefaultPosition, wxSize(120, 30));
    m_restart_btn->SetBackgroundColour(wxColour(0, 150, 136));
    m_restart_btn->SetForegroundColour(*wxWHITE);
    m_restart_btn->SetFont(btn_font_sm);
    m_stop_btn = new wxButton(m_server_toolbar, wxID_ANY, _L("Stop Server"), wxDefaultPosition, wxSize(120, 30));
    m_stop_btn->SetBackgroundColour(wxColour(180, 60, 60));
    m_stop_btn->SetForegroundColour(*wxWHITE);
    m_stop_btn->SetFont(btn_font_sm);
    tb_sizer->Add(m_restart_btn, 0, wxALL, 4);
    tb_sizer->Add(m_stop_btn, 0, wxALL, 4);
    m_server_toolbar->SetSizer(tb_sizer);
    m_main_sizer->Add(m_server_toolbar, 0, wxEXPAND);
    m_server_toolbar->Hide();

    m_restart_btn->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) {
        wxBusyCursor wait;
        auto* dlg = new wxProgressDialog(_L("PrintFarm"), _L("Restarting server..."),
            100, this, wxPD_APP_MODAL | wxPD_AUTO_HIDE | wxPD_SMOOTH);
        dlg->Pulse(_L("Restarting server..."));
        stop_server();
        m_server_running = false;
        wxMilliSleep(1000);
        copy_resources_to_appdata();
        dlg->Pulse(_L("Restarting server..."));
        start_server();
        m_server_running = true;
        wxMilliSleep(3000);
        dlg->Destroy();
        std::string url = wxGetApp().app_config->get("printfarm_url");
        if (url.empty()) url = "http://localhost:46259";
        load_url(wxString(url));
    });
    m_stop_btn->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) {
        stop_server();
        m_server_running = false;
        m_server_toolbar->Hide();
        show_setup();
        wxGetApp().app_config->set("printfarm_mode", "");
        update_tab_label();
    });

    // Create webview
    m_webview = new PrinterWebView(this);
    m_main_sizer->Add(m_webview, 1, wxEXPAND);
    m_webview->Hide();

    SetSizer(m_main_sizer);

    // Check config to decide which panel to show
    auto* config = wxGetApp().app_config;
    std::string mode = config->get("printfarm_mode");

    if (mode == "server") {
        m_setup_done = true;
        std::string url = config->get("printfarm_url");
        if (url.empty()) url = "http://localhost:46259";

        // Health check: is server already running?
        bool server_alive = false;
        try {
            Slic3r::Http::get("http://localhost:46259/api/health")
                .timeout_connect(2)
                .timeout_max(3)
                .on_complete([&](std::string, unsigned status) {
                    if (status == 200) server_alive = true;
                })
                .on_error([](std::string, std::string, unsigned) {})
                .perform_sync();
        } catch (...) {}

        if (server_alive) {
            // Server already running, just connect
            m_server_running = true;
            show_webview();
            load_url(wxString(url));
        } else {
            // Server not running, start it
            start_server();
            m_server_running = true;
            show_webview();
            // Delay load to give server time to start
            wxMilliSleep(3000);
            load_url(wxString(url));
        }
        update_tab_label();
    } else if (mode == "client") {
        m_setup_done = true;
        std::string url = config->get("printfarm_url");
        if (!url.empty()) {
            show_webview();
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
    setup_sizer->Add(subtitle, 0, wxALIGN_CENTER | wxBOTTOM, 20);

    // Setup icon (spans above both cards)
    wxStaticBitmap* setup_icon = new wxStaticBitmap(m_setup_panel, wxID_ANY,
        create_scaled_bitmap("printfarm_setup", m_setup_panel, 155));
    setup_sizer->Add(setup_icon, 0, wxALIGN_CENTER | wxBOTTOM, 20);

    // Two cards side by side
    wxBoxSizer* cards_sizer = new wxBoxSizer(wxHORIZONTAL);
    cards_sizer->AddStretchSpacer(1);

    // --- Server Card (Left) ---
    wxPanel* server_card = new wxPanel(m_setup_panel, wxID_ANY, wxDefaultPosition, wxSize(350, 250));
    server_card->SetBackgroundColour(wxColour(50, 55, 65));
    wxBoxSizer* server_sizer = new wxBoxSizer(wxVERTICAL);

    wxStaticText* server_title = new wxStaticText(server_card, wxID_ANY, _L("Run as Server"));
    server_title->SetForegroundColour(*wxWHITE);
    wxFont card_title_font = server_title->GetFont();
    card_title_font.SetPointSize(14);
    card_title_font.SetWeight(wxFONTWEIGHT_BOLD);
    server_title->SetFont(card_title_font);
    server_sizer->Add(server_title, 0, wxALIGN_CENTER | wxTOP, 25);

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
    wxPanel* client_card = new wxPanel(m_setup_panel, wxID_ANY, wxDefaultPosition, wxSize(350, 250));
    client_card->SetBackgroundColour(wxColour(50, 55, 65));
    wxBoxSizer* client_sizer = new wxBoxSizer(wxVERTICAL);

    wxStaticText* client_title = new wxStaticText(client_card, wxID_ANY, _L("Connect as Client"));
    client_title->SetForegroundColour(*wxWHITE);
    client_title->SetFont(card_title_font);
    client_sizer->Add(client_title, 0, wxALIGN_CENTER | wxTOP, 25);

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
    if (m_server_toolbar)
        m_server_toolbar->Hide();
    m_setup_panel->Show();
    m_main_sizer->Layout();
}

void PrintFarmPanel::show_webview()
{
    m_setup_panel->Hide();
    m_webview->Show();
    if (m_server_running && m_server_toolbar)
        m_server_toolbar->Show();
    m_main_sizer->Layout();
}

// Recursive copy with skip list
void PrintFarmPanel::copy_resources_to_appdata()
{
    boost::filesystem::path appdata_dir;
#ifdef _WIN32
    const char* appdata = std::getenv("APPDATA");
    if (appdata)
        appdata_dir = boost::filesystem::path(appdata) / "printfarm";
#else
    const char* home = std::getenv("HOME");
    if (home)
        appdata_dir = boost::filesystem::path(home) / ".printfarm";
#endif
    if (appdata_dir.empty()) {
        BOOST_LOG_TRIVIAL(error) << "PrintFarm: Cannot determine AppData path";
        return;
    }

    boost::filesystem::path res_dir = boost::filesystem::path(Slic3r::resources_dir()) / "printfarm";
    if (!boost::filesystem::exists(res_dir)) {
        BOOST_LOG_TRIVIAL(error) << "PrintFarm: resources/printfarm not found at " << res_dir.string();
        return;
    }

    boost::filesystem::create_directories(appdata_dir);

    // Delete dist folder first so stale files don't linger
    boost::filesystem::path dist_dir = appdata_dir / "server" / "dist";
    if (boost::filesystem::exists(dist_dir)) {
        boost::filesystem::remove_all(dist_dir);
        BOOST_LOG_TRIVIAL(info) << "PrintFarm: Cleared old dist at " << dist_dir.string();
    }

    BOOST_LOG_TRIVIAL(info) << "PrintFarm: Copying " << res_dir.string() << " -> " << appdata_dir.string();

    // Files/dirs to skip
    auto should_skip = [](const std::string& filename) {
        return filename == "data.db" || filename == "data.db-shm" || filename == "data.db-wal"
            || filename == ".env";
    };

    // Recursive copy
    for (auto& entry : boost::filesystem::recursive_directory_iterator(res_dir)) {
        auto rel = boost::filesystem::relative(entry.path(), res_dir);
        auto dest = appdata_dir / rel;

        // Check if any component should be skipped
        bool skip = false;
        for (auto& part : rel) {
            if (should_skip(part.string())) { skip = true; break; }
        }
        if (skip) continue;

        try {
            if (boost::filesystem::is_directory(entry.path())) {
                boost::filesystem::create_directories(dest);
            } else {
                boost::filesystem::create_directories(dest.parent_path());
                boost::filesystem::copy_file(entry.path(), dest, boost::filesystem::copy_options::overwrite_existing);
            }
        } catch (const std::exception& e) {
            BOOST_LOG_TRIVIAL(warning) << "PrintFarm: Copy failed for " << rel.string() << ": " << e.what();
        }
    }

    // Ensure .env exists
    {
        boost::filesystem::path env_file = appdata_dir / "server" / ".env";
        boost::filesystem::create_directories(env_file.parent_path());

        std::string existing_secret;
        if (boost::filesystem::exists(env_file)) {
            std::ifstream ifs(env_file.string());
            std::string line;
            while (std::getline(ifs, line)) {
                if (line.find("JWT_SECRET=") == 0)
                    existing_secret = line.substr(11);
            }
        }

        if (existing_secret.empty()) {
            std::string computer_name = "default";
#ifdef _WIN32
            const char* cn = std::getenv("COMPUTERNAME");
            if (cn) computer_name = cn;
#endif
            existing_secret = "printfarm_" + computer_name + "_secret";
        }

        boost::filesystem::path storage_dir = appdata_dir / "storage";
        boost::filesystem::create_directories(storage_dir);

        std::ofstream ofs(env_file.string());
        if (ofs.is_open()) {
            ofs << "PORT=46259" << std::endl;
            ofs << "JWT_SECRET=" << existing_secret << std::endl;
            ofs << "STORAGE_PATH=" << storage_dir.string() << std::endl;
            ofs.close();
            BOOST_LOG_TRIVIAL(info) << "PrintFarm: Written .env at " << env_file.string();
        }
    }

    BOOST_LOG_TRIVIAL(info) << "PrintFarm: Copy complete";
}

void PrintFarmPanel::poll_server_ready()
{
    m_poll_count++;

    // Phase 1: Wait for copy to finish
    if (!m_copy_done) {
        if (m_progress_dlg) m_progress_dlg->Pulse(_L("Preparing server files..."));
        if (m_poll_count > 120) { // 60 seconds max for copy
            m_poll_timer.Stop();
            BOOST_LOG_TRIVIAL(error) << "PrintFarm: Copy timed out after 60 seconds";
            if (m_progress_dlg) { m_progress_dlg->Destroy(); m_progress_dlg = nullptr; }
            m_setup_panel->Enable();
        }
        return;
    }

    // Phase 2: Start server (once, after copy done)
    if (!m_server_running) {
        if (m_progress_dlg) m_progress_dlg->Pulse(_L("Starting server..."));
        start_server();
        m_server_running = true;
        update_tab_label();
        m_poll_count = 0;

        // Register Admin0 in background after server starts
        std::thread([this]() {
            std::this_thread::sleep_for(std::chrono::milliseconds(4000));
            try {
                Slic3r::Http::post("http://localhost:46259/api/auth/register")
                    .header("Content-Type", "application/json")
                    .set_post_body(std::string("{\"username\":\"Admin0\",\"password\":\"admin0\",\"role\":\"admin\"}"))
                    .on_complete([](std::string, unsigned) {})
                    .on_error([](std::string, std::string, unsigned) {})
                    .perform_sync();
            } catch (...) {}
        }).detach();

        return;
    }

    // Phase 3: Wait 4 seconds after server start (8 ticks * 500ms), then show webview
    if (m_progress_dlg) m_progress_dlg->Pulse(_L("Connecting..."));
    if (m_poll_count >= 8) {
        m_poll_timer.Stop();
        BOOST_LOG_TRIVIAL(info) << "PrintFarm: Showing webview after " << m_poll_count * 500 << "ms";
        if (m_progress_dlg) { m_progress_dlg->Destroy(); m_progress_dlg = nullptr; }
        m_setup_panel->Enable();
        show_webview();
        load_url("http://localhost:46259");
    }
}

void PrintFarmPanel::on_start_server()
{
    m_setup_panel->Disable();

    // Save config
    auto* config = wxGetApp().app_config;
    config->set("printfarm_mode", "server");
    config->set("printfarm_url", "http://localhost:46259");
    config->save();
    m_setup_done = true;

    // Show progress dialog (separate OS window, no rendering glitch)
    m_progress_dlg = new wxProgressDialog(
        _L("PrintFarm"),
        _L("Preparing server files..."),
        100, this,
        wxPD_APP_MODAL | wxPD_AUTO_HIDE | wxPD_SMOOTH
    );
    m_progress_dlg->Pulse();

    // --- Step 1: Copy resources → AppData in background thread ---
    m_copy_done = false;
    std::thread([this]() {
        try {
            copy_resources_to_appdata();
        } catch (const std::exception& e) {
            BOOST_LOG_TRIVIAL(error) << "PrintFarm: File copy failed: " << e.what();
        }
        m_copy_done = true;
    }).detach();

    // --- Step 3: Poll copy completion + server readiness with timer ---
    m_poll_count = 0;
    m_poll_timer.SetOwner(this);
    Unbind(wxEVT_TIMER, &PrintFarmPanel::on_poll_timer, this);
    Bind(wxEVT_TIMER, &PrintFarmPanel::on_poll_timer, this);
    m_poll_timer.Start(500);
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

        boost::filesystem::path vbs_path = appdata_dir / "start-hidden.vbs";
        boost::filesystem::path node_exe = appdata_dir / "node" / "node.exe";
        boost::filesystem::path index_js = appdata_dir / "server" / "src" / "index.js";

        if (boost::filesystem::exists(vbs_path)) {
            wxString command = wxString::Format("wscript \"%s\"", vbs_path.string());
            BOOST_LOG_TRIVIAL(info) << "PrintFarm: Starting server with: " << command.ToStdString();
            wxExecute(command, wxEXEC_ASYNC);
        } else if (boost::filesystem::exists(node_exe) && boost::filesystem::exists(index_js)) {
            wxString command = wxString::Format("\"%s\" \"%s\"", node_exe.string(), index_js.string());
            BOOST_LOG_TRIVIAL(info) << "PrintFarm: Starting server (direct) with: " << command.ToStdString();
            wxExecute(command, wxEXEC_ASYNC | wxEXEC_HIDE_CONSOLE);
        } else {
            BOOST_LOG_TRIVIAL(warning) << "PrintFarm: Server files not found in " << appdata_dir.string();
        }

#else
        const char* home = std::getenv("HOME");
        if (home) {
            appdata_dir = boost::filesystem::path(home) / ".printfarm";
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
    // Server keeps running after Orca exits (independent process).
    // Only "Stop Server" button explicitly kills it.
    BOOST_LOG_TRIVIAL(info) << "PrintFarm: Orca closing, server left running";
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
            tabpanel->SetPageText(i, _L("PrintFarm"));
            break;
        }
    }
}

} // namespace GUI
} // namespace Slic3r
